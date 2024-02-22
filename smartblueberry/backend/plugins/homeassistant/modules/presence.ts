import * as hapi from '@hapi/hapi'
import { EVENT_HASSREGISTRY, State, StatePayloadFilter } from '../registry.js'
import { EVENT_STORAGE } from '../../storage.js'
import { EVENT_HASSCONNECT } from '../connect.js'
import dayjs from 'dayjs'
import Joi from 'joi'

declare module '@hapi/hapi' {
  interface PluginProperties {
    presence: {
      lastPresence: (areaId: string) => dayjs.Dayjs | undefined
    }
  }
}

export enum EVENT_HASSPRESENCE {
  PRESENCEMODE_UPDATED = 'hasspresence#presence-mode',
  PRESENCE_EVENT = 'hasspresence#presence-event'
}

enum PRESENCEMODE {
  PRESENT = 'present',
  AWAY = 'away',
  ABANDONED = 'abandoned'
}

const MOTION_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /^binary_sensor\./.test(value),
  attributes: {
    device_class: 'motion'
  }
}

const OCCUPANCY_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /^binary_sensor\./.test(value),
  attributes: {
    device_class: 'occupancy'
  }
}

const OBJECT_IDS = {
  presenceMode: (server: hapi.Server) =>
    server.app.hassSelect.getEntityId('presence_mode')
}

const presencePlugin: hapi.Plugin<{}> = {
  name: 'presence',
  dependencies: ['storage', 'hassSelect', 'hassConnect', 'hassRegistry'],

  register: async (server: hapi.Server) => {
    server.event(Object.values(EVENT_HASSPRESENCE))

    // Setup Routes
    await setupPresenceRoutes(server)

    // Setup Presence Memory
    await setupPresenceMemory(server)

    // Setup Home Assistant Helper Entities
    await setupPresenceModeEntity(server)
  }
}

/**
 * Setup Presence Memory
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when presence memory had been set up.
 */
async function setupPresenceMemory(server: hapi.Server) {
  const memory: { [key: string]: string } = {}

  server.events.on(EVENT_HASSPRESENCE.PRESENCE_EVENT, (areaId: string) => {
    memory[areaId] = dayjs().toISOString()
  })

  const lastPresence = (areaId: string) => {
    return memory[areaId] ? dayjs(memory[areaId]) : undefined
  }

  server.expose({ lastPresence })
}

/**
 * Setup Presence Mode entity
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when presence modes had been set up.
 */
async function setupPresenceModeEntity(server: hapi.Server) {
  const entityId = OBJECT_IDS.presenceMode(server)

  const initialize = async () => {
    try {
      await server.app.hassSelect.upsert(entityId, {
        name: 'Presence Mode',
        icon: 'mdi:motion-sensor',
        options: Object.values(PRESENCEMODE)
      })
    } catch (err) {
      console.error(`Could not upsert "${entityId}"...`)
    }
  }

  const update = async () => {
    const classify = (
      motionUnixTime: number,
      awayHours: number,
      abandonedHours: number
    ) => {
      const motion = dayjs.unix(motionUnixTime)
      const now = dayjs()
      if (motion.add(abandonedHours, 'hour').isBefore(now)) {
        return PRESENCEMODE.ABANDONED
      } else if (motion.add(awayHours, 'hour').isBefore(now)) {
        return PRESENCEMODE.AWAY
      } else {
        return PRESENCEMODE.PRESENT
      }
    }

    const recentMotionUnixTime = server.app.hassRegistry
      .getStates(MOTION_ENTITY)
      .map(({ last_updated }) => dayjs(last_updated).unix())
      .reduce((previous, next) => Math.max(previous, next), 0)

    const { away, abandoned } =
      (await server.plugins.storage.get('presence/tresholds')) || {}

    const presenceMode = classify(
      recentMotionUnixTime,
      away !== undefined ? away : 3,
      abandoned !== undefined ? abandoned : 24
    )

    try {
      await server.app.hassSelect.select(
        OBJECT_IDS.presenceMode(server),
        presenceMode
      )
    } catch (err) {
      console.error(`Could not select "${presenceMode}" for "${entityId}"...`)
    }
  }

  const trigger = async (state: State) => {
    if (
      server.app.hassRegistry.matchesStateFilter(state, {
        ...MOTION_ENTITY,
        state: 'on'
      })
    ) {
      const { areaId } = state
      await update()

      if (areaId !== null) {
        console.log(`New motion triggered in area "${areaId}"...`)
        server.events.emit(EVENT_HASSPRESENCE.PRESENCE_EVENT, areaId)
      }
    }
  }

  const awake = async () => {
    const occupancyAreaIds = server.app.hassRegistry
      .getStates({
        ...OCCUPANCY_ENTITY,
        state: 'on'
      })
      .map((state) => state.areaId)
      .filter((value, index, array) => {
        return value !== null && array.indexOf(value) === index
      })

    for (const presenceAreaId of occupancyAreaIds) {
      console.log(`Keep motion awake in area "${presenceAreaId}"...`)
      server.events.emit(EVENT_HASSPRESENCE.PRESENCE_EVENT, presenceAreaId)
    }
  }

  server.events.on(EVENT_HASSCONNECT.CONNECTED, initialize)
  server.plugins.schedule.addJob('every minute', awake)
  server.plugins.schedule.addJob('every 5 minutes', update)
  server.events.on(EVENT_STORAGE.STORAGE_UPDATED, update)
  server.events.on(EVENT_HASSREGISTRY.STATE_UPDATED, trigger)
}

/**
 * Set up the presence-related routes for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the routes are set up.
 */
async function setupPresenceRoutes(server: hapi.Server) {
  server.route({
    method: 'GET',
    path: '/api/presence-tresholds',
    handler: async (request, h) => {
      const { away, abandoned } =
        (await server.plugins.storage.get('presence/tresholds')) || {}
      return h.response({ away, abandoned }).code(200)
    }
  })

  server.route({
    method: 'POST',
    path: '/api/presence-tresholds',
    options: {
      validate: {
        payload: {
          away: Joi.number().min(1).required(),
          abandoned: Joi.number().min(1).greater(Joi.ref('away')).required()
        }
      }
    },
    handler: async (request, h) => {
      const { away, abandoned } = request.payload as any
      const tresholds = {
        away,
        abandoned
      }
      await server.plugins.storage.set('presence/tresholds', tresholds)
      return h.response(tresholds).code(200)
    }
  })
}

export default presencePlugin
