import 'dotenv/config'
import Joi from 'joi'
import * as Hapi from '@hapi/hapi'
import { plugin as jwtPlugin } from '@hapi/jwt'
import filesPlugin from './plugins/files.js'
import healthcheckPlugin from './plugins/healthcheck.js'
import storagePlugin from './plugins/storage.js'
import authenticatePlugin from './plugins/authenticate.js'
import dashboardPlugin from './plugins/homeassistant/modules/dashboard.js'
import doorsWindowsPlugin from './plugins/homeassistant/modules/doors-windows.js'
import presencePlugin from './plugins/homeassistant/modules/presence.js'
import lightPlugin from './plugins/homeassistant/modules/light.js'
import irrigationPlugin from './plugins/homeassistant/modules/irrigation.js'
import hassConnectPlugin from './plugins/homeassistant/connect.js'
import hassRegistryPlugin from './plugins/homeassistant/registry.js'
import { randomUUID } from 'crypto'
import schedulePlugin from './plugins/schedule.js'
import hassSelectPlugin from './plugins/homeassistant/entities/select.js'
import optionsPlugin from './plugins/homeassistant/options.js'

export const env = {
  HTTP_PORT: process.env.HTTP_PORT || 8099,
  BUILD: process.env.BUILD || 'production',
  CONFIG_DIR: process.env.CONFIG_DIR || `/data/`,
  JWT_SECRET: process.env.JWT_SECRET || randomUUID(),
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
  SUPERVISOR_REST_URL:
    process.env.SUPERVISOR_REST_URL || 'http://supervisor/core/api',
  SUPERVISOR_WS_URL:
    process.env.SUPERVISOR_WS_URL || 'ws://supervisor/core/websocket',
  SUPERVISOR_TOKEN: process.env.SUPERVISOR_TOKEN || undefined,
  CLIENT_NAME: process.env.CLIENT_NAME || 'Smart Blueberry 🫐'
}

const server = Hapi.server({
  port: env.HTTP_PORT,
  host: '0.0.0.0',
  routes: {
    cors: env.BUILD !== 'production',
    validate: {
      failAction: async (request, h, err) => {
        env.BUILD !== 'production' && console.error(err)
        throw err
      }
    }
  }
})

server.validator(Joi)

await server.register([
  jwtPlugin,
  optionsPlugin,
  storagePlugin,
  authenticatePlugin,
  hassConnectPlugin,
  hassRegistryPlugin,
  hassSelectPlugin,
  dashboardPlugin,
  healthcheckPlugin,
  filesPlugin,
  schedulePlugin,
  doorsWindowsPlugin,
  presencePlugin,
  lightPlugin,
  irrigationPlugin
])

await server.start()
console.log('Server [%s] running on %s', env.BUILD, server.info.uri)

await server.plugins.hassConnect.globalConnect()

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err)
  process.exit(1)
})
