import inertPlugin from '@hapi/inert'
import Accept from '@hapi/accept'
import fs from 'fs'
import hapi from '@hapi/hapi'
import path from 'path'

function fileTree(directory: string, tree: { [key: string]: any } = {}) {
  const files = fs.readdirSync(directory)
  for (let file of files) {
    const filePath = path.join(directory, file)
    tree[file] = fs.lstatSync(filePath).isDirectory()
      ? fileTree(filePath, tree[file])
      : filePath
  }
  return tree
}

const filesPlugin: hapi.Plugin<{}> = {
  name: 'files',
  register: async (server: hapi.Server) => {
    const locales = fileTree(path.join(process.cwd() + '/dist/frontend'))
    await server.register(inertPlugin)
    server.route({
      method: 'GET',
      options: { auth: false },
      path: '/{p*}',
      handler: (request, h) => {
        const locale =
          Accept.language(
            request.headers['accept-language'],
            Object.keys(locales)
          ) || 'en'

        let path = locales[locale]
        for (const param of request.params.p.split('/')) {
          path = path[param]
          if (path === undefined) {
            break
          }
        }
        return h
          .file(typeof path !== 'string' ? locales[locale]['index.html'] : path)
          .code(200)
      }
    })
  }
}

export default filesPlugin
