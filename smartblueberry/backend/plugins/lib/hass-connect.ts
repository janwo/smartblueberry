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

export const HOMEASSISTANT_EVENT_NAME = 'homeassistant-event'
export enum HOMEASSISTANT_EVENT_TAGS {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  INITIALLY_CONNECTED = 'initially-connected'
}

declare module '@hapi/hapi' {
  interface PluginProperties {
    hassConnect: {
      globalConnection: ConnectionHelper
      connect: typeof ConnectionHelper.connect
    }
  }
}

const haConnectPlugin: hapi.Plugin<{}> = {
  name: 'hassConnect',
  dependencies: ['storage'],
  register: async (server: hapi.Server) => {
    server.event({ name: HOMEASSISTANT_EVENT_NAME })
    server.expose('globalConnection', new ConnectionHelper(server))
    server.route({
      method: 'GET',
      path: '/api/global-connection',
      handler: getGlobalConnection
    })

    if (env.SUPERVISOR_TOKEN === undefined) {
      server.expose('connect', ConnectionHelper.connect)

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
    userConnection = await request.server.plugins.hassConnect.connect(userAuth)

    const clientName = `${env.CLIENT_NAME} (${uuid()})`
    const accessToken: string = await userConnection.sendMessagePromise({
      type: 'auth/long_lived_access_token',
      client_name: clientName,
      lifespan: 365 * 10
    })

    const connection =
      await request.server.plugins.hassConnect.globalConnection.connect(
        accessToken
      )

    await request.server.plugins.storage.set(
      `global-connection/client-name`,
      clientName
    )

    return h
      .response({ connected: !!connection?.connected, client_name: clientName })
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
  const globalConnection =
    await request.server.plugins.hassConnect.globalConnection.connect()
  globalConnection?.close()
  await request.server.plugins.storage.delete('global-connection')
  return h.response({ connected: false, client_name: undefined }).code(200)
}

async function getGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const globalConnection =
    await request.server.plugins.hassConnect.globalConnection.connect()
  const clientName = env.SUPERVISOR_TOKEN
    ? 'Supervisor'
    : await request.server.plugins.storage.get(`global-connection/client-name`)
  return h
    .response({
      connected: globalConnection?.connected || false,
      client_name: clientName
    })
    .code(200)
}

class ConnectionHelper {
  private globalConnection: Connection | undefined = undefined

  constructor(private server: hapi.Server) {}

  static async connect(auth: Auth) {
    return new Promise<Connection>(async (resolve, reject) => {
      try {
        const connection = await createConnection({
          createSocket: () => ConnectionHelper.createSocket(auth)
        })
        resolve(connection)
      } catch (err) {
        reject(err)
      }
    })
  }

  public async connect<Token extends AuthData['access_token'] | undefined>(
    reauthenticateWithAccessToken = undefined as Token
  ): Promise<Token extends undefined ? Connection | undefined : Connection> {
    if (!reauthenticateWithAccessToken && this.globalConnection?.connected) {
      return this.globalConnection
    }

    const accessToken =
      env.SUPERVISOR_TOKEN ||
      reauthenticateWithAccessToken ||
      (await this.server.plugins.storage.get(`global-connection/access-token`))

    if (accessToken) {
      const auth = createLongLivedTokenAuth(env.HOMEASSISTANT_URL, accessToken)

      this.globalConnection?.close()
      this.globalConnection = await ConnectionHelper.connect(auth)

      // Listen and fire events
      this.globalConnection?.addEventListener('ready', async () => {
        console.log(`Connected to home assistant...`)
        this.server.events.emit({
          name: HOMEASSISTANT_EVENT_NAME,
          tags: HOMEASSISTANT_EVENT_TAGS.CONNECTED
        })
      })

      this.globalConnection?.addEventListener('disconnected', () => {
        console.log(`Disconnected from home assistant...`)
        this.server.events.emit({
          name: HOMEASSISTANT_EVENT_NAME,
          tags: HOMEASSISTANT_EVENT_TAGS.DISCONNECTED
        })
      })

      console.log(`Initially connected to home assistant...`)
      this.server.events.emit({
        name: HOMEASSISTANT_EVENT_NAME,
        tags: [
          HOMEASSISTANT_EVENT_TAGS.CONNECTED,
          HOMEASSISTANT_EVENT_TAGS.INITIALLY_CONNECTED
        ]
      })

      if (reauthenticateWithAccessToken) {
        await this.server.plugins.storage.set(
          `global-connection/access-token`,
          accessToken
        )
      }

      return this.globalConnection
    }

    if (reauthenticateWithAccessToken !== undefined) {
      throw new Error(`No auth data found!`)
    }

    return undefined as any
  }

  static async createSocket(auth: Auth): Promise<any> {
    return new Promise((resolve, reject) => {
      let invalidAuth = false
      let retries = 0
      const connect = () => {
        const socket = new WebSocket(
          env.SUPERVISOR_TOKEN ? env.SUPERVISOR_WS_URL : auth.wsUrl,
          {
            rejectUnauthorized: true
          }
        )

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
                access_token: env.SUPERVISOR_TOKEN || auth.accessToken
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
}

export default haConnectPlugin
