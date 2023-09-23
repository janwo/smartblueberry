import * as hapi from '@hapi/hapi'
import { randomUUID } from 'crypto'
import dayjs from 'dayjs'
import Joi from 'joi'
import { EVENT_STORAGE } from '../../storage.js'
import { EVENT_HASSCONNECT } from '../connect.js'
import { EVENT_HASSREGISTRY, State, StatePayloadFilter } from '../registry.js'
import { EVENT_HASSPRESENCE } from './presence.js'

const DEFAULTS = {
  obscuredTreshold: 0.2,
  brightTreshold: 0.7
}

const OBJECT_IDS = {
  lightCondition: (server: hapi.Server) =>
    server.app.hassSelect.getEntityId('light_condition'),
  lightMode: (server: hapi.Server, areaId: string) =>
    server.app.hassSelect.getEntityId(`light_mode_${areaId}`)
}

type LightMode = {
  name: string
  obscuredCondition: LIGHT_MODE
  brightCondition: LIGHT_MODE
  darkCondition: LIGHT_MODE
  brightness: number
  duration: number
}

enum LIGHT_MODE {
  AUTO_ON = 'auto-on',
  ON = 'on',
  OFF = 'off',
  SIMULATE = 'simulate',
  UNCHANGED = 'unchanged'
}

enum ILLUMINANCE_CLASSIFCIATION {
  DARK = 'dark',
  OBSCURED = 'obscured',
  BRIGHT = 'bright'
}

const ILLUMINANCE_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /sensor\..*illuminance.*/.test(value),
  attributes: {
    state_class: 'measurement'
  }
}

const LIGHT_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /light\..*/.test(value)
}

const lightPlugin: hapi.Plugin<{}> = {
  name: 'light',
  dependencies: ['storage', 'hassSelect', 'hassConnect', 'hassRegistry'],
  register: async (server: hapi.Server) => {
    // Setup Routes
    await setupLightModeRoutes(server)

    // Setup Home Assistant Helper Entities
    await setupLightCondition(server)
    await setupLightModeEntities(server)
  }
}

/**
 * Setup Light Condition entity
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when light conditions had been set up.
 */
async function setupLightCondition(server: hapi.Server) {
  const entityId = OBJECT_IDS.lightCondition(server)

  const initialize = async () => {
    try {
      await server.app.hassSelect.upsert(entityId, {
        name: 'Light Condition',
        icon: 'mdi:brightness-6',
        options: Object.values(ILLUMINANCE_CLASSIFCIATION)
      })
    } catch (err) {
      console.error(`Could not upsert "${entityId}"...`)
    }
  }

  const update = async () => {
    const lightCondition = await getLightCondition(server)
    try {
      await server.app.hassSelect.select(
        OBJECT_IDS.lightCondition(server),
        lightCondition
      )
    } catch (err) {
      console.error(`Could not select "${lightCondition}" for "${entityId}"...`)
    }
  }

  server.plugins.schedule.addJob('every 5 minutes', update)
  server.events.on(EVENT_STORAGE.STORAGE_UPDATED, update)
  server.events.on(EVENT_HASSCONNECT.CONNECTED, initialize)
}

/**
 * Retrieves the current light condition based on sensor values and sun elevation.
 *
 * @async
 * @param server The Hapi server instance.
 * @returns The current light condition.
 */
async function getLightCondition(server: hapi.Server) {
  const darkest = (conditions: (ILLUMINANCE_CLASSIFCIATION | undefined)[]) => {
    const orderedConditions = [
      ILLUMINANCE_CLASSIFCIATION.DARK,
      ILLUMINANCE_CLASSIFCIATION.OBSCURED,
      ILLUMINANCE_CLASSIFCIATION.BRIGHT
    ]
    for (const orderedCondition of orderedConditions) {
      if (conditions.some((condition) => orderedCondition === condition)) {
        return orderedCondition
      }
    }

    return ILLUMINANCE_CLASSIFCIATION.BRIGHT
  }

  const classify = (value: number, obscured: number, bright: number) => {
    if (value < obscured) {
      return ILLUMINANCE_CLASSIFCIATION.DARK
    } else if (value < bright) {
      return ILLUMINANCE_CLASSIFCIATION.OBSCURED
    } else {
      return ILLUMINANCE_CLASSIFCIATION.BRIGHT
    }
  }

  const { obscured, bright } =
    (await server.plugins.storage.get('light/tresholds')) || {}

  const illuminanceSensors =
    server.app.hassRegistry.getStates(ILLUMINANCE_ENTITY)

  const sensorValues = Object.values(illuminanceSensors)
    .map(({ state }) => Math.min(1, Math.max(0, parseFloat(state) / 100)))
    .filter((value) => !Number.isNaN(value))
    .map((value) =>
      classify(
        value,
        obscured !== undefined ? obscured : DEFAULTS.obscuredTreshold,
        bright !== undefined ? bright : DEFAULTS.brightTreshold
      )
    )

  const sensorValue = sensorValues.sort()[sensorValues.length / 2]
  const sun = server.app.hassRegistry.getState('sensor.sun_solar_elevation')
  const sunValue = sun && classify(parseFloat(sun.state), 0, 20)

  return darkest([sensorValue, sunValue])
}

/**
 * Setup Light Mode entities
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when light modes had been set up.
 */
async function setupLightModeEntities(server: hapi.Server) {
  const callback = async () => {
    console.log('Update light mode entities...')
    const areas = server.app.hassRegistry.getAreas()
    for (const { area_id } of areas) {
      try {
        const select = await server.app.hassSelect.upsert(
          OBJECT_IDS.lightMode(server, area_id),
          {
            name: `Light Mode`,
            icon: 'mdi:home-lightbulb',
            options: (
              Object.values(
                (await server.plugins.storage.get('light/modes')) || [
                  'Not configured'
                ]
              ) as {
                name: string
              }[]
            ).map((lightMode) => lightMode.name)
          }
        )

        select &&
          (await server.app.hassRegistry.updateEntity(
            `input_select.${select.id}`,
            {
              area_id
            }
          ))
      } catch {
        console.log(`Could not upset light mode entity for area "${area_id}"`)
      }
    }
  }

  for (const event of [
    EVENT_HASSREGISTRY.AREA_UPDATED,
    EVENT_STORAGE.STORAGE_UPDATED,
    EVENT_HASSCONNECT.CONNECTED
  ]) {
    server.events.on(event, callback)
  }

  // Setup light actions for different light modes
  await setupConstantLightModes(server)
  await setupAutoOnLightMode(server)
  await setupSimulateLightMode(server)
}

/**
 * React on condition changes [lightModes: on, off]
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when listening of constant light modes start.
 */
async function setupConstantLightModes(server: hapi.Server) {
  const callback = async () => {
    for (const { area_id } of server.app.hassRegistry.getAreas()) {
      const lightMode = await getAreaLightMode(server, area_id)
      switch (lightMode?.mode) {
        case 'on':
          await server.app.hassRegistry.callService('light', 'turn_on', {
            target: { area_id },
            service_data: { brightness: lightMode.options.brightness }
          })
          break

        case 'off':
          await server.app.hassRegistry.callService('light', 'turn_off', {
            target: { area_id }
          })
          break
      }
    }
  }

  server.events.on(EVENT_STORAGE.STORAGE_UPDATED, callback)
  server.events.on(
    EVENT_HASSREGISTRY.ENTITY_UPDATED,
    async (entityId: string) => {
      if (
        entityId == OBJECT_IDS.lightCondition(server) ||
        entityId.startsWith(OBJECT_IDS.lightMode(server, ''))
      ) {
        await callback()
      }
    }
  )
}

/**
 * React on motion [lightModes: auto-on]
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when listening of auto-on light modes start.
 */
async function setupAutoOnLightMode(server: hapi.Server) {
  server.events.on(
    EVENT_HASSPRESENCE.PRESENCE_EVENT,
    async (areaId: string) => {
      const { mode, options } = (await getAreaLightMode(server, areaId)) || {}
      switch (mode) {
        case 'auto-on':
          await server.app.hassRegistry.callService('light', 'turn_on', {
            target: { area_id: areaId },
            service_data: { brightness: options?.brightness }
          })
          break
      }
    }
  )

  server.plugins.schedule.addJob('every minute', async () => {
    try {
      for (const { area_id } of server.app.hassRegistry.getAreas()) {
        const lightMode = await getAreaLightMode(server, area_id)
        switch (lightMode?.mode) {
          case 'auto-on':
            const elapsedTime = dayjs(dayjs()).subtract(
              lightMode.options.duration,
              'minute'
            )

            const elapsedEntities = server.app.hassRegistry
              .getStates({
                ...LIGHT_ENTITY,
                area_id,
                last_updated: (last_updated: string) =>
                  elapsedTime.isAfter(last_updated),
                state: 'off'
              })
              .map(({ entity_id }) => entity_id)

            if (elapsedEntities.length > 0) {
              await server.app.hassRegistry.callService('light', 'turn_off', {
                target: { entity_id: elapsedEntities }
              })
            }
            break
        }
      }
    } catch (err) {}
  })
}

/**
 * Simulate lights [lightModes: simulate]
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when listening of simulate light modes start.
 */
async function setupSimulateLightMode(server: hapi.Server) {
  server.plugins.schedule.addJob('every 5 minutes', async () => {
    try {
      for (const { area_id } of server.app.hassRegistry.getAreas()) {
        const lightMode = await getAreaLightMode(server, area_id)
        switch (lightMode?.mode) {
          case 'simulate':
            const historyTimestamp = dayjs(dayjs())
              .subtract(1, 'month')
              .toISOString()

            const lightEntityNames = server.app.hassRegistry
              .getStates({
                ...LIGHT_ENTITY,
                area_id
              })
              .map(({ entity_id }) => entity_id)

            if (lightEntityNames.length > 0) {
              const { ok, json } = await server.plugins.hassConnect.rest.get<
                Pick<State, 'entity_id' | 'state'>[][]
              >(
                `/history/period/${historyTimestamp}?${[
                  `end_time=${historyTimestamp}`,
                  `minimal_response=true`,
                  `filter_entity_id=${lightEntityNames.join(',')}`
                ].join('&')}`
              )

              const hadActiveLight =
                ok &&
                !!json?.some((entityHistory) => {
                  return entityHistory.some(
                    (entityHistoryRecord) => entityHistoryRecord.state == 'on'
                  )
                })

              const service = hadActiveLight ? 'turn_on' : 'turn_off'
              await server.app.hassRegistry.callService('light', service, {
                target: { entity_id: lightEntityNames }
              })
            }
            break
        }
      }
    } catch (err) {}
  })
}

/**
 * Retrieves the light mode for a specific area based on the current light condition.
 * @param server The Hapi server instance.
 * @param areaId The unique identifier of the area.
 * @returns The light mode and its options, or undefined if data is missing.
 */
async function getAreaLightMode(server: hapi.Server, areaId: string) {
  const lightConditionMap: {
    [key: string]: 'darkCondition' | 'obscuredCondition' | 'brightCondition'
  } = {
    [ILLUMINANCE_CLASSIFCIATION.BRIGHT]: 'brightCondition',
    [ILLUMINANCE_CLASSIFCIATION.DARK]: 'darkCondition',
    [ILLUMINANCE_CLASSIFCIATION.OBSCURED]: 'obscuredCondition'
  }
  const lightConditionEntity = server.app.hassRegistry.getState(
    OBJECT_IDS.lightCondition(server)
  )
  const lightModeEntity = server.app.hassRegistry.getState(
    OBJECT_IDS.lightMode(server, areaId)
  )

  if (!lightConditionEntity || !lightModeEntity) {
    return undefined
  }

  const lightModes =
    (await server.plugins.storage.get<{
      [key: string]: LightMode
    }>('light/modes')) || []
  const lightMode = Object.values(lightModes).find(
    ({ name }) => name == lightModeEntity?.state
  )

  return (
    lightMode && {
      mode: lightMode[lightConditionMap[lightConditionEntity.state]],
      options: {
        duration: lightMode.duration,
        brightness: lightMode.brightness
      }
    }
  )
}

/**
 * Set up the light-related routes for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the routes are set up.
 */
async function setupLightModeRoutes(server: hapi.Server) {
  server.route({
    method: 'GET',
    path: '/api/light-modes',
    handler: async (request, h) => {
      const lightModeMap =
        (await request.server.plugins.storage.get('light/modes')) || {}
      const lightModes = (Object.entries(lightModeMap) as [string, any][]).map(
        ([id, lightMode]) => ({ id, ...lightMode })
      )
      return h.response(lightModes).code(200)
    }
  })

  server.route({
    method: 'POST',
    path: '/api/light-modes',
    options: {
      validate: {
        payload: {
          id: Joi.string()
            .uuid()
            .optional()
            .default(() => randomUUID()),
          name: Joi.string().min(1).required(),
          obscuredCondition: Joi.string()
            .pattern(/(?:on)|(?:off)|(?:auto-on)|(?:simulate)|(?:unchanged)/)
            .required(),
          darkCondition: Joi.string()
            .pattern(/(?:on)|(?:off)|(?:auto-on)|(?:simulate)|(?:unchanged)/)
            .required(),
          brightCondition: Joi.string()
            .pattern(/(?:on)|(?:off)|(?:auto-on)|(?:simulate)|(?:unchanged)/)
            .required(),
          brightness: Joi.number().min(0).max(1).optional(),
          duration: Joi.number().min(0).required()
        }
      }
    },
    handler: async (request, h) => {
      const { id, ...lightMode } = request.payload as any
      await server.plugins.storage.set(`light/modes/${id}`, lightMode)
      return h.response({ id, ...lightMode }).code(200)
    }
  })

  server.route({
    method: 'DELETE',
    path: '/api/light-modes',
    options: {
      validate: {
        payload: {
          id: Joi.string().uuid().required()
        }
      }
    },
    handler: async (request, h) => {
      const { id } = request.payload as any
      await server.plugins.storage.delete(`light/modes/${id}`)
      return h.response().code(200)
    }
  })

  server.route({
    method: 'GET',
    path: '/api/light-tresholds',
    handler: async (request, h) => {
      const { bright, obscured } = (await server.plugins.storage.get(
        'light/tresholds'
      )) || {
        obscured: DEFAULTS.obscuredTreshold,
        bright: DEFAULTS.brightTreshold
      }
      return h.response({ bright, obscured }).code(200)
    }
  })

  server.route({
    method: 'POST',
    path: '/api/light-tresholds',
    options: {
      validate: {
        payload: {
          obscured: Joi.number().min(0.05).max(1).required(),
          bright: Joi.number()
            .min(0.05)
            .max(1)
            .greater(Joi.ref('obscured'))
            .required()
        }
      }
    },
    handler: async (request, h) => {
      const { bright, obscured } = request.payload as any
      const tresholds = {
        bright,
        obscured
      }
      await server.plugins.storage.set('light/tresholds', tresholds)
      return h.response(tresholds).code(200)
    }
  })
}
export default lightPlugin
