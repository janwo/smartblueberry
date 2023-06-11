import { Config, JsonDB } from "node-json-db"
import * as Hapi from "@hapi/hapi"
import * as Joi from "joi"

declare module "@hapi/hapi" {
  interface PluginProperties {
    "app/storage": {
      get(path: string, defaultValue?: any): Promise<any | undefined>
      set(path: string, obj: any): Promise<void>
      delete(path: string): Promise<void>
    }
  }
}

const storagePlugin = {
  name: "app/storage",
  register: async (server: Hapi.Server, options: { port?: number }) => {
    const db = new JsonDB(
      new Config(process.cwd() + "/data/json-storage.json", true, true, "/")
    )

    const dbHelper = (() => {
      const createPath = (path: string) => "/" + path.split("/").join("/")
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
        },
      }
    })()

    server.expose("get", dbHelper.get)
    server.expose("set", dbHelper.set)
    server.expose("delete", dbHelper.delete)

    // Start server on different port
    const jsonServer = Hapi.server({
      port:
        options.port !== undefined
          ? options.port
          : (server.info.port as number) + 1,
      host: server.info.host,
      routes: {
        cors: process.env.build !== "production",
      },
    })

    jsonServer.route({
      method: "GET",
      path: "/json-storage/{path*}",
      options: {
        validate: {
          params: { path: Joi.string().required() },
          payload: Joi.object().required(),
        },
      },
      handler: async (request, h) => {
        return {
          data: await dbHelper.get(request.params.path),
        }
      },
    })

    jsonServer.route({
      method: "POST",
      path: "/json-storage/{path*}",

      options: {
        validate: {
          params: { path: Joi.string().required() },
          payload: Joi.object().required(),
        },
        payload: { allow: "application/json" },
      },
      handler: async (request, h) => {
        await dbHelper.set(request.params.path, request.payload)
        return {
          success: true,
        }
      },
    })

    jsonServer.route({
      method: "DELETE",
      path: "/json-storage/{path*}",
      options: {
        validate: {
          params: { path: Joi.string().required() },
        },
      },
      handler: async (request, h) => {
        await dbHelper.delete(request.params.path)
        return {
          success: true,
        }
      },
    })

    server.events.on("start", () => server.control(jsonServer))
    await jsonServer.start()
    console.log("JSON-Server running on %s", jsonServer.info.uri)
  },
}

export default storagePlugin
