import {
  Auth,
  AuthData,
  ERR_INVALID_AUTH,
  MSG_TYPE_AUTH_INVALID,
  MSG_TYPE_AUTH_OK,
  createConnection,
  Connection,
  createLongLivedTokenAuth
} from 'home-assistant-js-websocket'
import WebSocket from 'ws'
import * as hapi from '@hapi/hapi'
import { env } from '../../index.js'
import { v4 as uuid } from 'uuid'

export type GlobalAuth = AuthData['access_token']
export type UserAuth = Auth

let _connection: Connection | undefined = undefined

declare module '@hapi/hapi' {
  interface PluginProperties {
    'app/ha-connect': {
      globalConnection: (reconnect?: GlobalAuth) => Promise<Connection>
      connect: (auth: UserAuth) => Promise<Connection>
    }
  }
}

async function setGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const userAuth = request.auth.credentials.user!.auth
  let userConnection
  try {
    userConnection = await request.server.plugins['app/ha-connect'].connect(
      userAuth
    )

    const access_token: string = await userConnection.sendMessagePromise({
      type: 'auth/long_lived_access_token',
      client_name: `${env.CLIENT_NAME} (${uuid()})`,
      lifespan: 365 * 10
    })

    await request.server.plugins['app/ha-connect'].globalConnection(
      access_token
    )

    await request.server.plugins['app/storage'].set(
      `global-connection/access_token`,
      access_token
    )

    return h.response().code(access_token ? 200 : 400)
  } catch (err) {
    return h.response().code(400)
  } finally {
    userConnection?.close()
  }
}

async function unsetGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  await request.server.plugins['app/storage'].delete(
    'global-connection/access_token'
  )

  const connection = await request.server.plugins[
    'app/ha-connect'
  ].globalConnection()
  console.log(connection.connected)
  connection?.close()
  return h.response().code(200)
}

async function getGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const connection = await request.server.plugins[
    'app/ha-connect'
  ].globalConnection()
  return h.response({ connected: connection?.connected || false }).code(200)
}

const haConnectPlugin = {
  name: 'app/ha-connect',
  dependencies: ['app/storage'],
  register: async (server: hapi.Server) => {
    const connect = (auth: Auth) => {
      return new Promise<Connection>(async (resolve, reject) => {
        try {
          const connection = await createConnection({
            createSocket: () => createSocket(auth)
          })
          resolve(connection)
        } catch (err) {
          reject(err)
        }
      })
    }

    const globalConnection = (access_token?: AuthData['access_token']) => {
      return new Promise<Connection | undefined>(async (resolve, reject) => {
        if (!access_token && _connection?.connected) {
          return resolve(_connection)
        }

        const auth = createLongLivedTokenAuth(
          env.HOMEASSISTANT_URL,
          access_token ||
            (await server.plugins['app/storage'].get(
              `global-connection/access_token`
            ))
        )

        if (auth) {
          try {
            _connection && _connection?.close()
            _connection = await connect(auth)
            return resolve(_connection)
          } catch (err) {
            return reject(err)
          }
        }

        return access_token
          ? reject(new Error(`No auth data found!`))
          : resolve(undefined)
      })
    }

    server.expose('globalConnection', globalConnection)
    server.expose('connect', connect)

    // Add global connection setup route
    server.route({
      method: 'POST',
      path: '/api/set-global-connection',
      handler: setGlobalConnection
    })

    server.route({
      method: 'POST',
      path: '/api/unset-global-connection',
      handler: unsetGlobalConnection
    })

    server.route({
      method: 'GET',
      path: '/api/global-connection',
      handler: getGlobalConnection
    })
  }
}

export function createSocket(auth: Auth): Promise<any> {
  const { wsUrl } = auth

  return new Promise((resolve, reject) => {
    let invalidAuth = false
    let retries = 0
    const connect = () => {
      const socket = new WebSocket(wsUrl, {
        rejectUnauthorized: true
      })

      const onCloseOrError = () => {
        if (invalidAuth) {
          reject(ERR_INVALID_AUTH)
          return
        }

        setTimeout(() => connect(), 1000 + retries * retries * 1000)
      }

      const onOpen = async () => {
        try {
          auth.expired && (await auth.refreshAccessToken())
          socket.send(
            JSON.stringify({
              type: 'auth',
              access_token: auth.accessToken
            })
          )
        } catch (err) {
          invalidAuth = err === ERR_INVALID_AUTH
          socket.close()
        }
      }

      const handleMessage = (event: Buffer) => {
        const { type } = JSON.parse(event.toString())
        switch (type) {
          case MSG_TYPE_AUTH_INVALID:
            invalidAuth = true
            socket.close()
            break

          case MSG_TYPE_AUTH_OK:
            socket.off('open', onOpen)
            socket.off('message', handleMessage)
            socket.off('close', onCloseOrError)
            socket.off('error', onCloseOrError)
            resolve(socket)
            break
        }
      }

      socket.on('open', onOpen)
      socket.on('message', handleMessage)
      socket.on('close', onCloseOrError)
      socket.on('error', onCloseOrError)
    }

    return connect()
  })
}

export default haConnectPlugin
