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
import { randomUUID } from 'crypto'

declare module '@hapi/hapi' {
  interface PluginProperties {
    hassConnect: {
      connect: typeof connect
      rest: ReturnType<typeof createRest>
      globalConnect: ReturnType<typeof createGlobalConnect>
    }
  }
}

export type GlobalAuth = AuthData['access_token']
export type UserAuth = Auth

export enum EVENT_HASSCONNECT {
  CONNECTED = 'hassconnect#connected',
  DISCONNECTED = 'hassconnect#disconnected'
}

/**
 * Create a new global connection client.
 * @param server The hapi server instance.
 * @returns The global connection client,
 */
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
      try {
        const auth = createLongLivedTokenAuth(
          env.HOMEASSISTANT_URL,
          accessToken
        )

        globalConnection?.close()
        globalConnection = await connect(auth)

        // Listen and fire events
        globalConnection?.addEventListener('ready', async () => {
          console.log(`Reconnected to home assistant...`)
          server.events.emit(EVENT_HASSCONNECT.CONNECTED)
        })

        globalConnection?.addEventListener('disconnected', () => {
          console.log(`Disconnected from home assistant...`)
          server.events.emit(EVENT_HASSCONNECT.DISCONNECTED)
        })

        if (reauthenticateWithAccessToken) {
          await server.plugins.storage.set(
            `global-connection/access-token`,
            accessToken
          )
        }

        console.log(`Connected to home assistant...`)
        server.events.emit(EVENT_HASSCONNECT.CONNECTED)
        return globalConnection
      } catch (error) {
        console.error('Error authenticatiing to Home Assistant...', error)
        return undefined as any
      }
    }

    if (reauthenticateWithAccessToken !== undefined) {
      throw new Error(`No auth data found!`)
    }

    return undefined as any
  }
}

/**
 * Sets the long-lived access token for the global connection client.
 * @param request The hapi.Request object.
 * @param h The hapi.ResponseToolkit object.
 * @returns The hapi.Response object.
 */
async function setGlobalConnection(
  request: hapi.Request,
  h: hapi.ResponseToolkit
) {
  const userAuth = request.auth.credentials.user!.auth
  let userConnection
  try {
    userConnection = await request.server.plugins.hassConnect.connect(userAuth)

    const clientName = `${env.CLIENT_NAME} (${randomUUID()})`
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

/**
 * Deletes the long-lived access token for the global connection client.
 * @param request The hapi.Request object.
 * @param h The hapi.ResponseToolkit object.
 * @returns The hapi.Response object.
 */
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

/**
 * Retrieves the long-lived access token for the global connection client.
 * @param request The hapi.Request object.
 * @param h The hapi.ResponseToolkit object.
 * @returns The hapi.Response object.
 */
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

/**
 * Connects to the home assistant websocket.
 * @param auth The authentication to use for the connection.
 * @returns The connection to the home assistant websocket.
 */
async function connect(auth: Auth) {
  return new Promise<Connection>(async (resolve, reject) => {
    try {
      const connection = await createConnection({
        createSocket: () => createSocket(auth) as any
      })
      resolve(connection)
    } catch (error) {
      console.error('Error connecting to Home Assistant...', error)
      reject(undefined as any)
    }
  })
}

/**
 * Creates the node websocket for the connection.
 * @param auth The authentication to use for the connection.
 * @returns The websocket of the connection.
 */
async function createSocket(auth: Auth): Promise<WebSocket> {
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

/**
 * Creates the REST client for the HassConnect plugin.
 * @param server The Hapi server instance.
 * @returns The REST client.
 */
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
      })
    } catch (err: any) {
      console.error('Unauthenticated rest call!', err?.status)
      return undefined
    }
  }

  return {
    get: async <R = any>(endpoint: RequestInfo) => {
      const res = await call('GET', endpoint)
      return {
        ok: res?.ok || false,
        json: res?.ok ? ((await res.json()) as R) : undefined
      }
    },
    post: async <R = any>(endpoint: RequestInfo, jsonBody?: Object) => {
      const res = await call('POST', endpoint, jsonBody)
      return {
        ok: res?.ok || false,
        json: res?.ok ? ((await res.json()) as R) : undefined
      }
    },
    put: async <R = any>(endpoint: RequestInfo, jsonBody?: Object) => {
      const res = await call('PUT', endpoint, jsonBody)
      return {
        ok: res?.ok || false,
        json: res?.ok ? ((await res.json()) as R) : undefined
      }
    },
    delete: async (endpoint: RequestInfo) => {
      return call('DELETE', endpoint).then((res) => {
        return res?.ok || false
      })
    }
  }
}

const hassConnectPlugin: hapi.Plugin<{}> = {
  name: 'hassConnect',
  dependencies: ['storage'],
  register: async (server: hapi.Server) => {
    server.event(Object.values(EVENT_HASSCONNECT))
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

export default hassConnectPlugin
