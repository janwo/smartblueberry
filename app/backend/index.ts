import 'dotenv/config'
import Joi from 'joi'
import * as Hapi from '@hapi/hapi'
import { plugin as jwtPlugin } from '@hapi/jwt'
import filesPlugin from './plugins/lib/files.js'
import healthcheckPlugin from './plugins/lib/healthcheck.js'
import storagePlugin from './plugins/lib/storage.js'
import authenticatePlugin from './plugins/lib/authenticate.js'
import themeBuilderPlugin from './plugins/lib/theme-builder.js'
import heatingPlugin from './plugins/heating.js'
import presencePlugin from './plugins/presence.js'
import securityPlugin from './plugins/security.js'
import lightPlugin from './plugins/light.js'
import irrigationPlugin from './plugins/irrigation.js'
import haConnectPlugin from './plugins/lib/hass-connect.js'
import haRegistryPlugin from './plugins/lib/hass-registry.js'

export const env = {
  THEMES_DIR: process.env.THEMES_DIR || `data/themes/`,
  CONFIG_DIR: process.env.CONFIG_DIR || `data/`,
  HTTP_PORT: process.env.HTTP_PORT || 8234,
  BUILD: process.env.BUILD || 'production',
  JWT_SECRET: process.env.JWT_SECRET || 'SUPER_SECRET_JWT_SECRET',
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
  CLIENT_NAME: process.env.CLIENT_NAME || 'SmartBlueBerry'
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
  storagePlugin,
  authenticatePlugin,
  haConnectPlugin,
  haRegistryPlugin,
  themeBuilderPlugin,
  healthcheckPlugin,
  filesPlugin,
  heatingPlugin,
  presencePlugin,
  securityPlugin,
  lightPlugin,
  irrigationPlugin
])

await server.start()
console.log('Server running on %s', server.info.uri)

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err)
  process.exit(1)
})
