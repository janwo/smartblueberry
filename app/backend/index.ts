import Joi from "joi"
import * as Hapi from "@hapi/hapi"
import { plugin as jwtPlugin } from "@hapi/jwt"
import filesPlugin from "@plugins/lib/files.js"
import healthcheckPlugin from "@plugins/lib/healthcheck.js"
import storagePlugin from "@plugins/lib/storage.js"
import authenticatePlugin from "@plugins/lib/authenticate.js"
import themeBuilderPlugin from "@plugins/lib/theme-builder.js"
import heatingPlugin from "@plugins/heating.js"
import presencePlugin from "@plugins/presence.js"
import securityPlugin from "@plugins/security.js"
import lightPlugin from "@plugins/light.js"
import irrigationPlugin from "@plugins/irrigation.js"

export const env = {
  THEMES_DIR: `/config/themes/`,
  CONFIG_DIR: `/config/`,
  BUILD: process.env.build,
}

const server = Hapi.server({
  port: 8234,
  host: "0.0.0.0",
  routes: {
    cors: env.BUILD !== "production",
    validate: {
      failAction: async (request, h, err) => {
        if (env.BUILD !== "production") {
          console.error(err)
          throw err
        }
      },
    },
  },
})

server.validator(Joi)

await server.register([
  jwtPlugin,
  storagePlugin,
  healthcheckPlugin,
  filesPlugin,
  heatingPlugin,
  presencePlugin,
  securityPlugin,
  lightPlugin,
  irrigationPlugin,
  authenticatePlugin,
  themeBuilderPlugin,
])

await server.start()
console.log("Server running on %s", server.info.uri)

process.on("unhandledRejection", (err) => {
  console.log(err)
  process.exit(1)
})
