import * as hapi from '@hapi/hapi'
import Joi from 'joi'
import * as Jwt from '@hapi/jwt'
import * as Boom from '@hapi/boom'
import { v4 as uuid } from 'uuid'
import { Auth, AuthData } from 'home-assistant-js-websocket'
import { env } from '../../index.js'
import Cryptr from 'cryptr'
import { UserAuth } from './hass-connect.js'

export const API_AUTH_STATEGY = 'API'

declare module '@hapi/hapi' {
  interface UserCredentials {
    id: JWTToken['id']
    auth: UserAuth
  }
}

export type JWTToken = {
  id: string
  authData: string
}

const authenticatePlugin: hapi.Plugin<{}> = {
  name: 'authenticate',
  dependencies: ['storage'],
  register: async (server: hapi.Server) => {
    // Add jwt scheme
    server.auth.strategy(API_AUTH_STATEGY, 'jwt', {
      keys: env.JWT_SECRET,
      verify: { aud: false, iss: false, sub: false },
      validate: async (artifacts, request, h) => {
        const { id: tokenId, authData: encryptedAuthData } =
          artifacts.decoded.payload

        try {
          const CryptrInstance = new Cryptr(env.JWT_SECRET)
          const stringifiedAuthData = CryptrInstance.decrypt(encryptedAuthData)
          const { id, ...authData } = JSON.parse(stringifiedAuthData)
          return {
            isValid: tokenId === id,
            credentials: {
              user: { id, auth: getAuth(authData) }
            }
          }
        } catch (err) {
          return { isValid: false }
        }
      }
    })

    server.auth.default(API_AUTH_STATEGY)

    // Add authentication route
    server.route({
      method: 'POST',
      path: '/api/authenticate',
      options: {
        auth: { mode: 'try' },
        validate: {
          payload: Joi.object({
            access_token: Joi.string().required(),
            refresh_token: Joi.string().required(),
            expires_in: Joi.number().required(),
            expires: Joi.number().required()
          }).allow(null)
        }
      },
      handler: authenticate
    })
  }
}

async function authenticate(
  request: hapi.Request,
  h: hapi.ResponseToolkit
): Promise<hapi.ResponseObject | Boom.Boom> {
  const userAuth =
    (request.payload && getAuth(request.payload as any)) ||
    (request.auth.isAuthenticated && request.auth.credentials.user!.auth)

  if (userAuth) {
    //connect to home assistant
    let validAuth = false
    let userConnection
    try {
      userConnection = await request.server.plugins.hassConnect.connect(
        userAuth
      )
      validAuth = userConnection.connected
    } catch (err) {
      validAuth = false
    } finally {
      userConnection?.close()
    }

    if (validAuth) {
      const id = uuid()
      const CryptrInstance = new Cryptr(env.JWT_SECRET)
      const encryptedAuthData = CryptrInstance.encrypt(
        JSON.stringify({
          access_token: userAuth.data.access_token,
          refresh_token: userAuth.data.refresh_token,
          expires_in: userAuth.data.expires_in,
          expires: userAuth.data.expires,
          id
        })
      )
      const bearer = signJWT({ id, authData: encryptedAuthData })
      return h
        .response({
          success: true,
          bearer
        })
        .code(200)
    }
  }

  return h
    .response({
      success: false,
      hassUrl: env.HOMEASSISTANT_URL,
      error: `Could not connect to Home Assistant via ${env.HOMEASSISTANT_URL}`
    })
    .code(request.payload ? 401 : 200)
}

function signJWT(payload: JWTToken): string {
  return Jwt.token.generate(
    payload,
    {
      key: env.JWT_SECRET,
      algorithm: 'HS512'
    },
    {
      iat: false
    }
  )
}

function getAuth(authData: {
  access_token: AuthData['access_token']
  expires: AuthData['expires']
  expires_in: AuthData['expires_in']
  refresh_token: AuthData['refresh_token']
}): UserAuth {
  return new Auth({
    access_token: authData.access_token,
    expires: authData.expires,
    expires_in: authData.expires_in,
    refresh_token: authData.refresh_token,
    clientId: null,
    hassUrl: env.HOMEASSISTANT_URL
  })
}

export default authenticatePlugin
