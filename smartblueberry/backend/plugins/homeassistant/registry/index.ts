import * as hapi from '@hapi/hapi'
import { Registry } from './registry.js'
import {
  HOMEASSISTANT_EVENT_NAME,
  HOMEASSISTANT_EVENT_TAGS
} from '../ha-connect.js'

declare module '@hapi/hapi' {
  interface ServerApplicationState {
    hassRegistry: Registry
  }
}

const haRegistryPlugin: hapi.Plugin<{}> = {
  name: 'hassRegistry',
  dependencies: ['hassConnect'],
  register: async (server: hapi.Server) => {
    server.app.hassRegistry = new Registry(server)
  }
}

export default haRegistryPlugin
