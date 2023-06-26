import * as hapi from '@hapi/hapi'

const healthcheckPlugin: hapi.Plugin<{}> = {
  name: 'healthcheck',
  register: async (server: hapi.Server) => {
    server.route({
      options: { auth: false },
      method: 'GET',
      path: '/healthcheck',
      handler: (_, h) => {
        return h.response({ up: true }).code(200)
      }
    })
  }
}

export default healthcheckPlugin
