import { Config, JsonDB } from 'node-json-db'
import * as hapi from '@hapi/hapi'
import path from 'path'
import { env } from '../index.js'

declare module '@hapi/hapi' {
  interface PluginProperties {
    storage: ReturnType<typeof Storage>
  }
}

const storagePlugin: hapi.Plugin<{}> = {
  name: 'storage',
  register: async (server: hapi.Server, options: { port?: number }) => {
    const filePath = path.resolve(env.CONFIG_DIR, './json-storage.json')
    console.log(`Storage location is set to "${filePath}"`)
    server.expose(Storage(filePath))
  }
}

export default storagePlugin

function Storage(filePath: string) {
  const db = new JsonDB(
    new Config(filePath, true, env.BUILD != 'production', '/')
  )

  const createPath = (path: string) => {
    return '/' + path.split('/').join('/')
  }

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
}
