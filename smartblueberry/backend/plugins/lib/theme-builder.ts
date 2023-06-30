import { Config, JsonDB } from 'node-json-db'
import * as hapi from '@hapi/hapi'
import * as Joi from 'joi'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { env } from '../../index.js'

declare module '@hapi/hapi' {
  interface PluginProperties {
    themeBuilder: {
      update(): Promise<void>
    }
  }
}

interface Theme {
  filename: string
  yamlJson: (server: hapi.Server) => any
}

const themes: Theme[] = [
  {
    filename: 'main',
    yamlJson: (server) => ({
      number: 3,
      plain: 'string',
      block: 'two\nlines\n',
      test: { t: 3 }
    })
  }
]

const themeBuilderPlugin: hapi.Plugin<{}> = {
  name: 'themeBuilder',
  register: async (server: hapi.Server, options: { port?: number }) => {
    const updateThemeFiles = () => {
      for (const { yamlJson, filename } of themes) {
        const contents = yaml.stringify(yamlJson(server))
        fs.writeFileSync(
          path.resolve(process.cwd(), env.THEMES_DIR, filename),
          contents,
          'utf8'
        )
      }
    }

    server.expose('update', updateThemeFiles)
  }
}

export default themeBuilderPlugin
