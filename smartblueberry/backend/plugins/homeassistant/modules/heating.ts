import * as hapi from '@hapi/hapi'
import Joi from 'joi'
import dayjs from 'dayjs'
import { HOMEASSISTANT_EVENT_NAME } from '../ha-connect.js'
import {
  EntityObject,
  HOMEASSISTANT_EVENT_TAGS,
  Registry
} from '../registry/registry.js'

// see https://github.com/home-assistant/core/blob/dev/homeassistant/components/binary_sensor/__init__.py
const OPENABLE_DEVICE_CLASSES = ['door', 'window', 'opening', 'garage_door']
const HEATING_DEVICE_CLASSES = ['heating']

async function checkOpenStates(registry: Registry) {
  const openEntities = registry.getEntities({
    //  deviceClass: (deviceClass) => OPENABLE_DEVICE_CLASSES.includes(deviceClass)
  })

  const elapsedDevices = Object.values(openEntities)
    .filter(({ lastChanged }) => {
      return dayjs(lastChanged).add(1, 'hour').isBefore(dayjs())
    })
    .map((entity) => entity.getDevice())

  registry.getAreas({})

  const elapsedAreas = elapsedDevices
    .map((device) => device?.getArea())
    .filter((area) => area !== undefined)

  for (const area of elapsedAreas) {
    area?.getEntities({})
  }
}

// triggers.GenericCronTrigger('0 0/5 * ? * * *'),
// triggers.GroupStateUpdateTrigger('gCore_Heating_ContactSwitchable'),
// triggers.ItemStateUpdateTrigger('Core_Heating_Thermostat_ModeDefault'),
// triggers.ItemStateUpdateTrigger('Core_Heating_Thermostat_OpenContactShutdownMinutes')

/* 
Group gCore_Heating_ContactSwitchable
Group gCore_Heating_Thermostat_Mode
Group:Number:AVG gCore_Heating_Temperature

Group gCore_Heating "Klimaeinstellungen" (gCore_Home) ["Equipment"]

Number Core_Heating_Thermostat_ModeDefault "Temperaturmodus" (gCore_Heating) ["Point"] {
    stateDescription=""[
        options="0.0=Aus,2.0=Eco-Temperatur,1.0=Normaltemperatur,3.0=Heizen"
    ],
    cellWidget=""[
        label="\u003ditems.Core_Heating_Thermostat_ModeDefault.title",
        icon="f7:thermometer",
        action="options"
    ],
    listWidget=""[
        icon="f7:thermometer",
        action="options"
    ]
}

Number Core_Heating_Thermostat_OpenContactShutdownMinutes "Zeit bis alle Heizkörper bei offenen Kontakten ausschalten" (gCore_Heating) ["Point"] {
    stateDescription=""[
        pattern="%dmin",
        min="0",
        max="1440",
        step="5"
    ],
    listWidget="oh-stepper-item"[
        raised="true",
        round="true",
        icon="f7:timer",
        step="5"
    ]
}
      const openContactLocations = 
      get_all_semantic_items(
        OPEN_CONTACT_EQUIPMENT_TAGS,
        OPEN_CONTACT_POINT_TAGS
      )
        .filter((contact) => contact.state == 'OPEN')
        .map((contact) => get_location(contact))
        .filter((contact) => contact)
        .map((contact) => contact.name)

      let shutdownHeating = false
      const heatingShutdownMinutesItem = items.getItem(
        'Core_Heating_Thermostat_OpenContactShutdownMinutes'
      )

      if (openContactLocations.length > 0) {
        const openedSinceDate = (() => {
          const openedSince = json_storage(heatingShutdownMinutesItem).get(
            'heating',
            'open-contact-since'
          )
          if (openedSince) {
            return time.ZonedDateTime.parse(openedSince, DATETIME_FORMAT)
          }

          const now = time.ZonedDateTime.now()
          json_storage(heatingShutdownMinutesItem).set(
            'heating',
            'open-contact-since',
            now.format(DATETIME_FORMAT)
          )
          return now
        })()

        shutdownHeating =
          heatingShutdownMinutesItem.state &&
          openedSinceDate.until(
            time.ZonedDateTime.now(),
            time.ChronoUnit.MINUTES
          ) > heatingShutdownMinutesItem.state
      } else {
        json_storage(heatingShutdownMinutesItem).remove(
          'heating',
          'open-contact-since'
        )
      }

      const heaterModeItem = items.getItem(
        'Core_Heating_Thermostat_ModeDefault'
      )
      for (const modeItem of items.getItem('gCore_Heating_Thermostat_Mode')
        .members) {
        const location = get_location(modeItem)
        if (location) {
          let newState = undefined

          if (event.triggerType != 'GenericCronTrigger') {
            newState = stringifiedFloat(heaterModeItem.state)
          }

          if (shutdownHeating || openContactLocations.includes(location.name)) {
            newState = stringifiedFloat(HeatingState.OFF)
          }

          if (newState !== undefined) {
            const pointCommandMap = json_storage(modeItem).get(
              'heating',
              'command-map'
            )

            if (pointCommandMap?.[newState] !== undefined) {
              newState = pointCommandMap[newState]
            }

            if (modeItem.state != newState) {
              modeItem.sendCommand(newState)
            }
          }
        }
      }
    }
  */

const heatingPlugin: hapi.Plugin<{}> = {
  name: 'heating',
  dependencies: ['hassConnect', 'storage', 'hassRegistry'],
  register: async (server: hapi.Server) => {
    server.app.hassRegistry.on(
      [
        HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED,
        HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
      ],
      async (entity?: EntityObject) => {
        // Register rule "checkOpenStates"
        // if (!entity || OPENABLE_DEVICE_CLASSES.includes(entity.deviceClass)) {
        // await checkOpenStates(server.plugins.hassRegistry.registry)
        // }
      }
    )

    server.route({
      method: 'GET',
      path: '/api/heating-mode-items',
      handler: async (request, h) => {
        /*    const items = await request.server.plugins['app/openhab'].getItem(
          request,
          'gCore_Heating_Thermostat_Mode',
          true
        )
        const result = (items.members || []).map(async (item) => {
          let commandMap = await server.plugins['app/json-storage'].get(
            item.name,
            'heating/command-map'
          )
          commandMap = {
            off: commandMap?.['0.0'],
            on: commandMap?.['1.0'],
            eco: commandMap?.['2.0'],
            power: commandMap?.['3.0']
          }

          item.jsonStorage = { commandMap }
          return item
        })
        return h.response({ data: await Promise.all(result) }).code(200)
        */
      }
    })

    server.route({
      method: 'POST',
      path: '/api/heating-mode-item/{item}/command-map',
      options: {
        validate: {
          params: {
            item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
          },
          payload: {
            commandMap: Joi.object({
              on: Joi.string().alphanum().required(),
              off: Joi.string().alphanum().required(),
              eco: Joi.string().alphanum().required(),
              power: Joi.string().alphanum().required()
            }).required()
          }
        }
      },
      handler: async (request, h) => {
        /*
        const { commandMap } = request.payload as any
        await server.plugins['app/json-storage'].set(
          request.params.item,
          'heating/command-map',
          {
            '0.0': commandMap.off,
            '1.0': commandMap.on,
            '2.0': commandMap.eco,
            '3.0': commandMap.power
          }
        )
        return h.response({ success: true }).code(200)
        */
      }
    })

    server.route({
      method: 'DELETE',
      path: '/api/heating-mode-item/{item}/command-map',
      options: {
        validate: {
          params: {
            item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
          }
        }
      },
      handler: async (request, h) => {
        /*
        await server.plugins['app/json-storage'].delete(
          request.params.item,
          'heating/command-map'
        )
        return h.response({ success: true }).code(200)
        */
      }
    })

    server.route({
      method: 'GET',
      path: '/api/heating-contact-switchable-items',
      handler: async (request, h) => {
        /*
        let items = await request.server.plugins['app/openhab'].getItem(
          request,
          'gCore_Heating_ContactSwitchable',
          true
        )
        const result = items.members || []
        return h.response({ data: result }).code(200)
        */
      }
    })
  }
}

export default heatingPlugin
