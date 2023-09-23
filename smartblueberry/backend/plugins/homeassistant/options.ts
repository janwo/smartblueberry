import * as hapi from '@hapi/hapi'
import path from 'path'
import fs from 'fs'
import { env } from '../../index.js'

declare module '@hapi/hapi' {
  interface PluginProperties {
    options: {
      prefix: string
    }
  }
}

const optionsPlugin: hapi.Plugin<{}> = {
  name: 'options',
  register: async (server: hapi.Server) => {
    const optionsPath = path.resolve(env.CONFIG_DIR, './options.json')
    console.log(`Options location is set to "${optionsPath}"`)

    const optionsContents =
      fs.existsSync(optionsPath) && fs.readFileSync(optionsPath)?.toString()
    const options = JSON.parse(optionsContents || '{}')
    server.expose(options)

    // Provide options for frontend
    server.route({
      method: 'GET',
      path: '/api/options',
      handler: (request, h) => {
        return h.response(options).code(200)
      }
    })
  }
}

export default optionsPlugin
