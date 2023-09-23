import * as hapi from '@hapi/hapi'
import Joi from 'joi'
import { EVENT_HASSREGISTRY, State, StatePayloadFilter } from '../registry.js'

const OPENABLE_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /^binary_sensor\./.test(value),
  attributes: {
    device_class: (device_class) => {
      return ['door', 'window', 'opening', 'garage_door'].includes(
        device_class as string
      )
    }
  }
}

const doorsWindowsPlugin: hapi.Plugin<{}> = {
  name: 'doors+windows',
  dependencies: ['storage', 'hassSelect', 'hassConnect', 'hassRegistry'],
  register: async (server: hapi.Server) => {
    // Setup Routes
    await setupDoorsWindowsRoutes(server)

    // Setup Home Assistant Helper Entities
    await setupClimate(server)
  }
}

/**
 * Set up the doors and windows related routes for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the routes are set up.
 */
async function setupDoorsWindowsRoutes(server: hapi.Server) {
  server.route({
    method: 'POST',
    path: '/api/doors-windows-features',
    options: {
      validate: {
        payload: {
          climate: Joi.boolean().required()
        }
      }
    },
    handler: async (request, h) => {
      const { climate } = request.payload as any
      await server.plugins.storage.set(
        'doors+windows/climate/activate',
        climate
      )

      return h.response({ climate }).code(200)
    }
  })

  server.route({
    method: 'GET',
    path: '/api/doors-windows-features',
    handler: async (request, h) => {
      const climate =
        (await server.plugins.storage.get('doors+windows/climate/activate')) ||
        false

      return h.response({ climate }).code(200)
    }
  })
}

/**
 * Setup Climate entity.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when climate entities had been set up.
 */
async function setupClimate(server: hapi.Server) {
  server.events.on(EVENT_HASSREGISTRY.STATE_UPDATED, async (state: State) => {
    if (
      server.app.hassRegistry.matchesStateFilter(state, {
        ...OPENABLE_ENTITY
      })
    ) {
      // Turn on / off climate on open windows / doors
      if (await server.plugins.storage.get('doors+windows/climate/activate')) {
        const service = state.state == 'on' ? 'turn_off' : 'turn_on'
        await server.app.hassRegistry.callService('climate', service, {
          service_data: {
            entity_id: 'all'
          }
        })
      }
    }
  })
}

export default doorsWindowsPlugin
