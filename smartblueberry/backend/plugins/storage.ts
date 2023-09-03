import { Config, JsonDB } from 'node-json-db'
import * as hapi from '@hapi/hapi'
import path from 'path'
import { env } from '../index.js'

declare module '@hapi/hapi' {
  interface PluginProperties {
    storage: ReturnType<typeof Storage>
  }
}

export enum EVENT_STORAGE {
  STORAGE_UPDATED = 'storage#storage-updated'
}

const storagePlugin: hapi.Plugin<{}> = {
  name: 'storage',
  register: async (server: hapi.Server) => {
    server.event(Object.values(EVENT_STORAGE))
    const storage = Storage({
      onChange: () => {
        server.events.emit(EVENT_STORAGE.STORAGE_UPDATED)
      }
    })
    server.expose(storage)
  }
}

export default storagePlugin

function Storage({ onChange }: { onChange?: () => void }) {
  const filePath = path.resolve(env.CONFIG_DIR, './json-storage.json')
  console.log(`Storage location is set to "${filePath}"`)

  const db = new JsonDB(
    new Config(filePath, true, env.BUILD != 'production', '/')
  )

  const createPath = (path: string) => {
    return '/' + path.split('/').join('/')
  }

  return {
    /**
     * Gets the storage value at the given path.
     * @param path The storage path.
     * @returns The value at the given path.
     */
    get: async <T = any>(path: string): Promise<T> => {
      const fullPath = createPath(path)
      return (await db.exists(fullPath)) ? db.getData(fullPath) : undefined
    },

    /**
     * Deletes the storage value at the given path.
     * @param path The storage path.
     * @param silentChange True, if no change event should be triggered.
     * @returns Promise that resolves when the storage value has been deleted.
     */
    delete: async (path: string, silentChange = false) => {
      const fullPath = createPath(path)
      if (await db.exists(fullPath)) {
        await db.delete(fullPath)
        !silentChange && onChange && onChange()
      }
    },

    /**
     * Updates the storage value at the given path.
     * @param path The storage path.
     * @param obj The value to update.
     * @param silentChange True, if no change event should be triggered.
     * @returns Promise that resolves when the storage value has been updated.
     */
    set: async (path: string, obj: any, silentChange = false) => {
      const fullPath = createPath(path)
      await db.push(fullPath, obj, true)
      !silentChange && onChange && onChange()
    }
  }
}
