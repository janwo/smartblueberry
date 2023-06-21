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

let globalConnection: Connection | undefined = undefined

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

    const clientName = `${env.CLIENT_NAME} (${uuid()})`
    const accessToken: string = await userConnection.sendMessagePromise({
      type: 'auth/long_lived_access_token',
      client_name: clientName,
      lifespan: 365 * 10
    })

    const connection = await request.server.plugins[
      'app/ha-connect'
    ].globalConnection(accessToken)

    await request.server.plugins['app/storage'].set(
      `global-connection/client-name`,
      clientName
    )

    return h
      .response({ connected: connection.connected, client_name: clientName })
      .code(accessToken ? 200 : 400)
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
  const globalConnection = await request.server.plugins[
    'app/ha-connect'
  ].globalConnection()
  globalConnection?.close()
  await request.server.plugins['app/storage'].delete('global-connection')
  return h.response({ connected: false, client_name: undefined }).code(200)
}

async function getGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const globalConnection = await request.server.plugins[
    'app/ha-connect'
  ].globalConnection()
  const clientName = await request.server.plugins['app/storage'].get(
    `global-connection/client-name`
  )
  return h
    .response({
      connected: globalConnection?.connected || false,
      client_name: clientName
    })
    .code(200)
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

    const resolveGlobalConnection = (
      reauthenticateWithAccessToken?: AuthData['access_token']
    ) => {
      return new Promise<Connection | undefined>(async (resolve, reject) => {
        if (!reauthenticateWithAccessToken && globalConnection?.connected) {
          return resolve(globalConnection)
        }

        const accessToken =
          reauthenticateWithAccessToken ||
          (await server.plugins['app/storage'].get(
            `global-connection/access-token`
          ))

        if (accessToken) {
          const auth = createLongLivedTokenAuth(
            env.HOMEASSISTANT_URL,
            accessToken
          )

          try {
            globalConnection && globalConnection?.close()
            globalConnection = await connect(auth)
            if (reauthenticateWithAccessToken) {
              await server.plugins['app/storage'].set(
                `global-connection/access-token`,
                accessToken
              )
            }
            return resolve(globalConnection)
          } catch (err) {
            return reject(err)
          }
        }

        return reauthenticateWithAccessToken
          ? reject(new Error(`No auth data found!`))
          : resolve(undefined)
      })
    }

    server.expose('globalConnection', resolveGlobalConnection)
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
            reject(new Error(`Auth is invalid`))
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

/* connection.message({
          type: 'config/entity_registry/list'
        }),
        connection.message({
          type: 'config/device_registry/list'
        }),
        connection.message({
          type: 'config/area_registry/list'
        }),
        connection.message({
          type: 'subscribe_events',
          event_type: 'state_changed'
        }),
        connection.message({
          type: 'get_config'
        })
        */
export default haConnectPlugin
