import { Config, JsonDB } from 'node-json-db'
import * as hapi from '@hapi/hapi'
import path from 'path'
import { env } from '../../index.js'

declare module '@hapi/hapi' {
  interface PluginProperties {
    storage: {
      get(path: string, defaultValue?: any): Promise<any | undefined>
      set(path: string, obj: any): Promise<void>
      delete(path: string): Promise<void>
    }
  }
}

const storagePlugin: hapi.Plugin<{}> = {
  name: 'storage',
  register: async (server: hapi.Server, options: { port?: number }) => {
    const filePath = path.resolve(env.CONFIG_DIR, './json-storage.json')

    const db = new JsonDB(
      new Config(filePath, true, env.BUILD != 'production', '/')
    )

    if (env.BUILD !== 'production') {
      console.log(`Storage saved to "${filePath}"`)
    }

    const dbHelper = (() => {
      const createPath = (path: string) => '/' + path.split('/').join('/')
      return {
        get: async (path: string) => {
          const fullPath = createPath(path)
          return (await db.exists(fullPath)) ? db.getData(fullPath) : undefined
        },
        delete: async (path: string) => {
          const fullPath = createPath(path)
          if (await db.exists(fullPath)) {
            return db.delete(fullPath)
          }
        },
        set: async (path: string, obj: any) => {
          const fullPath = createPath(path)
          return db.push(fullPath, obj, true)
        }
      }
    })()

    server.expose('get', dbHelper.get)
    server.expose('set', dbHelper.set)
    server.expose('delete', dbHelper.delete)
  }
}

export default storagePlugin
