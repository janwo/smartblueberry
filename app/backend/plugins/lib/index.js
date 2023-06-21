// Connect
import WebSocket from 'ws'
const DEBUG = true

const createHassWS = (ws, debug = false) => {
  const waitingMessages = {}

  ws.on('message', (data) => {
    const { id, ...message } = JSON.parse(data.toString())
    debug && console.log('received: %s', data, id, message)

    if (waitingMessages[id]) {
      waitingMessages[id](message)
    }
  })

  return {
    message: (message, updates) => {
      return new Promise((resolve, reject) => {
        const messageId = Object.keys(waitingMessages).length + 1
        waitingMessages[messageId] = (message) => {
          if (updates) {
            updates(message)
          } else {
            delete waitingMessages[messageId]
          }

          resolve(message)
        }

        const messageString = JSON.stringify({ ...message, id: messageId })
        debug && console.log('send: %s', messageString)
        ws.send(messageString, (error) => {
          if (error) {
            return reject(error)
          }
        })
      })
    },
    ws
  }
}

const connect = (url) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('error', reject)
    ws.on('message', (message) => {
      const { type } = JSON.parse(message.toString())
      switch (type) {
        case 'auth_ok':
          console.log('authorized')
          return resolve(createHassWS(ws, DEBUG))
        case 'auth_required':
          ws.send(
            JSON.stringify({
              type: 'auth',
              access_token: 'TBD'
            })
          )
          break
        default:
          return reject(type)
      }
    })
  })
}

;(async () => {
  try {
    const connection = await connect('ws://localhost:8123/api/websocket')
    console.log(connection.connected)
    let [
      auth /*, { result: entities }, { result: devices }, { result: areas */
    ] = await Promise.all([
      connection.message({
        type: 'auth/long_lived_access_token',
        client_name: 'GP SLogger',
        lifespan: 365
      })
      /*     connection.message({
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
        })*/
    ])

    console.log(auth)

    /*  areas = Object.fromEntries(
      areas.map(({ area_id, name }) => [area_id, { name }])
    )

    devices = Object.fromEntries(
      devices.map(({ id, area_id, name }) => [
        id,
        { name, area: areas[area_id] }
      ])
    )

    entities = Object.fromEntries(
      entities.map(({ entity_id, device_id }) => [
        entity_id,
        { device: devices[device_id] }
      ])
    )

    console.log(entities)
    */
  } catch (err) {
    console.error(err)
  }
})()
