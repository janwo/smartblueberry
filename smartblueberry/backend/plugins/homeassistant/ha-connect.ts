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
      connect: typeof connect
      rest: ReturnType<typeof createRest>
      globalConnect: ReturnType<typeof createGlobalConnect>
    }
  }
}

function createGlobalConnect(server: hapi.Server) {
  let globalConnection: Connection | undefined = undefined

  return async <Token extends AuthData['access_token'] | undefined>(
    reauthenticateWithAccessToken = undefined as Token
  ): Promise<Token extends undefined ? Connection | undefined : Connection> => {
    if (!reauthenticateWithAccessToken && globalConnection?.connected) {
      return globalConnection
    }

    const accessToken =
      env.SUPERVISOR_TOKEN ||
      reauthenticateWithAccessToken ||
      (await server.plugins.storage.get(`global-connection/access-token`))

    if (accessToken) {
      const auth = createLongLivedTokenAuth(env.HOMEASSISTANT_URL, accessToken)

      globalConnection?.close()
      globalConnection = await connect(auth)

      // Listen and fire events
      globalConnection?.addEventListener('ready', async () => {
        console.log(`Connected to home assistant...`)
        server.events.emit({
          name: HOMEASSISTANT_EVENT_NAME,
          tags: HOMEASSISTANT_EVENT_TAGS.CONNECTED
        })
      })

      globalConnection?.addEventListener('disconnected', () => {
        console.log(`Disconnected from home assistant...`)
        server.events.emit({
          name: HOMEASSISTANT_EVENT_NAME,
          tags: HOMEASSISTANT_EVENT_TAGS.DISCONNECTED
        })
      })

      console.log(`Initially connected to home assistant...`)
      server.events.emit({
        name: HOMEASSISTANT_EVENT_NAME,
        tags: [
          HOMEASSISTANT_EVENT_TAGS.CONNECTED,
          HOMEASSISTANT_EVENT_TAGS.INITIALLY_CONNECTED
        ]
      })

      if (reauthenticateWithAccessToken) {
        await server.plugins.storage.set(
          `global-connection/access-token`,
          accessToken
        )
      }

      return globalConnection
    }

    if (reauthenticateWithAccessToken !== undefined) {
      throw new Error(`No auth data found!`)
    }

    return undefined as any
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

    const connection = await request.server.plugins.hassConnect.globalConnect(
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
    await request.server.plugins.hassConnect.globalConnect()
  globalConnection?.close()
  await request.server.plugins.storage.delete('global-connection')
  return h.response({ connected: false, client_name: undefined }).code(200)
}

async function getGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const globalConnection =
    await request.server.plugins.hassConnect.globalConnect()
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

async function connect(auth: Auth) {
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

async function createSocket(auth: Auth): Promise<any> {
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

      const onCloseOrError = (err: any) => {
        if (invalidAuth) {
          reject(ERR_INVALID_AUTH)
          return
        }

        setTimeout(() => connect(), retries * retries * 1000)
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
            invalidAuth = false
            retries = 0
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

      retries++
    }

    return connect()
  })
}

function createRest(server: hapi.Server) {
  const call = async (
    method: 'PUT' | 'POST' | 'GET' | 'DELETE',
    endpoint: RequestInfo,
    body?: Object
  ) => {
    const baseUrl = env.SUPERVISOR_TOKEN
      ? env.SUPERVISOR_REST_URL
      : `${env.HOMEASSISTANT_URL}/api`
    const bearer =
      env.SUPERVISOR_TOKEN ||
      (await server.plugins.storage.get(`global-connection/access-token`))

    try {
      return fetch(baseUrl + endpoint, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      }).then((res) => {
        return res.ok ? res.json() : undefined
      })
    } catch (err: any) {
      console.error('Unauthenticated rest call!', err?.status)
      return undefined
    }
  }

  return {
    get: (endpoint: RequestInfo) => {
      return call('GET', endpoint)
    },
    post: (endpoint: RequestInfo, body?: Object) => {
      return call('POST', endpoint, body)
    },
    put: (endpoint: RequestInfo, body?: Object) => {
      return call('PUT', endpoint, body)
    },
    delete: (endpoint: RequestInfo) => {
      return call('DELETE', endpoint)
    }
  }
}

const haConnectPlugin: hapi.Plugin<{}> = {
  name: 'hassConnect',
  dependencies: ['storage'],
  register: async (server: hapi.Server) => {
    server.event({ name: HOMEASSISTANT_EVENT_NAME })
    server.route({
      method: 'GET',
      path: '/api/global-connection',
      handler: getGlobalConnection
    })

    if (env.SUPERVISOR_TOKEN === undefined) {
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

    server.expose({
      connect,
      rest: createRest(server),
      globalConnect: createGlobalConnect(server)
    })
  }
}

export default haConnectPlugin
