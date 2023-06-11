import * as hapi from "@hapi/hapi"
import * as Joi from "joi"
import * as Jwt from "@hapi/jwt"
import * as Boom from "@hapi/boom"
import { Axios } from "axios"
import { v4 as uuid } from "uuid"
import { createConnection } from "home-assistant-js-websocket"

export const API_AUTH_STATEGY = "API"

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_JWT_SECRET"

declare module "@hapi/hapi" {
  interface UserCredentials extends JWTToken {
    bearer: string
  }

  interface AuthCredentials {
    client: Axios
  }
}

export type JWTToken = {
  id: string
}

async function deleteUser(request: hapi.Request, h: hapi.ResponseToolkit) {
  const { user } = request.params as any
  if (user != request.auth.credentials.user!.id) {
    await request.server.plugins["app/storage"].delete(`users/${user}`)
    return h.response().code(200)
  }

  return h.response().code(405)
}

async function setUserBearer(request: hapi.Request, h: hapi.ResponseToolkit) {
  const { global, bearer: newBearer } = request.payload as any
  const url = await request.server.plugins["app/storage"].get(`connection/url`)
  const userBearer = await request.server.plugins["app/storage"].get(
    `users/${request.auth.credentials.user!.id}/bearer`
  )

  const bearer = newBearer || userBearer
  const result = await haAxios(url, bearer).get("/")
  if (result.status != 200) {
    return h.response().code(400)
  }

  if (userBearer != bearer) {
    await request.server.plugins["app/storage"].set(
      `users/${request.auth.credentials.user!.id}/bearer`,
      bearer
    )
  }

  if (global) {
    await request.server.plugins["app/storage"].set(`connection/bearer`, bearer)
  }

  return h.response().code(200)
}

async function setUrl(request: hapi.Request, h: hapi.ResponseToolkit) {
  const { url } = request.payload as any
  const oldUrl = await request.server.plugins["app/storage"].get(
    "connection/url"
  )

  if (!oldUrl || request.auth.isAuthenticated) {
    await request.server.plugins["app/storage"].set("connection/url", url)
    return h.response().code(200)
  }

  return h.response().code(401)
}

async function authenticate(
  request: hapi.Request,
  h: hapi.ResponseToolkit
): Promise<hapi.ResponseObject | Boom.Boom> {
  const { bearer } = request.payload as any
  const url = await request.server.plugins["app/storage"].get("connection/url")

  //connect to home assistant
  const result = await haAxios(url, bearer).get("/")
  if (result.status == 200) {
    const globalBearer = await request.server.plugins["app/storage"].get(
      `connection/bearer`
    )
    if (!globalBearer) {
      await request.server.plugins["app/storage"].set(
        `connection/bearer`,
        bearer
      )
    }

    const id = uuid()
    await request.server.plugins["app/storage"].set(
      `users/${id}/bearer`,
      bearer
    )
    return h.response({ token: signJWT({ id }) }).code(200)
  }

  return h.response(result).code(401)
}

function signJWT(payload: JWTToken): string {
  return Jwt.token.generate(
    payload,
    {
      key: JWT_SECRET,
      algorithm: "HS512",
    },
    {
      iat: false,
    }
  )
}

function haAxios(url: string, bearer: string) {
  return new Axios({
    url: `${url.replace(/^(.*)\/*$/, "$1")}/api/`,
    headers: {
      Authorization: `Bearer ${bearer}`,
    },
  })
}

const authenticatePlugin = {
  name: "app/authenticate",
  dependencies: ["app/storage"],
  register: async (server: hapi.Server) => {
    // Add jwt scheme
    server.auth.strategy(API_AUTH_STATEGY, "jwt", {
      keys: JWT_SECRET,
      verify: { aud: false, iss: false, sub: false },
      validate: async (artifacts, request, h) => {
        const { id } = artifacts.decoded.payload
        const url = await server.plugins["app/storage"].get("connection/url")
        const user = await server.plugins["app/storage"].get(`users/${id}`)

        return {
          isValid: !!user,
          credentials: {
            user,
            client: haAxios(url, user.bearer),
          },
        }
      },
    })

    server.auth.default(API_AUTH_STATEGY)

    const globalHaAxios = async () => {
      const { url, bearer } = await server.plugins["app/storage"].get(
        "connection",
        {}
      )
      return haAxios(url, bearer)
    }

    server.expose("global-connect", globalHaAxios)

    // Add authentication route
    server.route({
      method: "POST",
      path: "/api/authenticate",
      options: {
        auth: false,
        validate: {
          payload: Joi.object({
            bearer: Joi.string().required(),
          }),
        },
      },
      handler: authenticate,
    })

    // Add set url route
    server.route({
      method: "POST",
      path: "/api/set-url",
      options: {
        auth: "try",
        validate: {
          payload: Joi.object({
            url: Joi.string().uri().required(),
          }),
        },
      },
      handler: setUrl,
    })

    // Add set user bearer
    server.route({
      method: "POST",
      path: "/api/set-bearer",
      options: {
        validate: {
          payload: {
            global: Joi.boolean().default(false),
            bearer: Joi.string().optional(),
          },
        },
      },
      handler: setUserBearer,
    })

    // Delete user
    server.route({
      method: "POST",
      path: "/api/delete-user/{user}",
      options: {
        validate: {
          params: Joi.string().required(),
        },
      },
      handler: deleteUser,
    })
  },
}

export default authenticatePlugin
