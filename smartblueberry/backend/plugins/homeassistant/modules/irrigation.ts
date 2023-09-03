import * as hapi from '@hapi/hapi'
import dayjs, { Dayjs } from 'dayjs'
import Joi from 'joi'
import { EVENT_HASSREGISTRY, State, StatePayloadFilter } from '../registry.js'

interface HydroRecord {
  datetime: string
  evaporation: number
  precipitation: number
}

const VALVE_ENTITY: StatePayloadFilter = {
  entity_id: (entity_id) => /^switch\..*valve.*$/.test(entity_id)
}

const FORECAST_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /^weather\./.test(value),
  attributes: {
    temperature_unit: (v) => v !== undefined,
    precipitation_unit: (v) => v !== undefined,
    forecast: (forecast) =>
      typeof forecast == 'object' &&
      !Array.isArray(forecast) &&
      ![
        forecast?.datetime,
        forecast?.templow,
        forecast?.temperature,
        forecast?.humidity,
        forecast?.precipitation
      ].some((v) => v === undefined)
  }
}

const irrigationPlugin: hapi.Plugin<{}> = {
  name: 'irrigation',
  dependencies: ['storage', 'hassSelect', 'hassConnect', 'hassRegistry'],
  register: async (server: hapi.Server) => {
    // Setup Routes
    await setupIrrigationRoutes(server)

    // Setup Home Assistant Helper Entities
    await setupWeatherCheck(server)
  }
}

/**
 * Calculates potential evaporation using the Hargreaves-Samani method.
 *
 * Equations taken from: Shuttleworth, W. J. Evaporation. In: Handbook of hydrology, D. R. Maidment, ed., McGraw-Hill, New York, 1993. Valiantzas, J. D. (2018). Modification of the Hargreaves–Samani model for estimating solar radiation from temperature and humidity data. Journal of Irrigation and Drainage Engineering, 144(1), 06017014.
 * @param date The date for which the calculation is performed.
 * @param tempMin The minimum temperature in Celsius.
 * @param tempMax The maximum temperature in Celsius.
 * @param humidity The relative humidity in percentage.
 * @param latitude The geographical latitude of the location.
 * @returns The calculated potential evaporation in mm per day.
 *
 */
const hargreavesSamani = (
  date = dayjs(),
  tempMin: number,
  tempMax: number,
  humidity: number,
  latitude: number
) => {
  const julianDate = Math.floor(date.startOf('day').unix() / 86400 + 2440587.5)
  const radians = latitude * (Math.PI / 180)

  // See equation 4.4.3
  const solarDeclination =
    0.4093 * Math.sin((2 * Math.PI * julianDate) / 365 - 1.405)

  // See equation 4.4.2
  const sunsetHourAngle = Math.acos(
    -Math.tan(radians) * Math.tan(solarDeclination)
  )

  // See equation 4.4.5
  const relativeEarthSunDistance =
    1 + 0.033 * Math.cos((2 * Math.PI * julianDate) / 365)

  // See equation 4.4.4
  const solarRadiation =
    15.392 *
    relativeEarthSunDistance *
    (sunsetHourAngle * Math.sin(radians) * Math.sin(solarDeclination) +
      Math.cos(radians) *
        Math.cos(solarDeclination) *
        Math.sin(sunsetHourAngle))

  // See equation 4.2.44
  const evaporation =
    0.0023 *
    solarRadiation *
    Math.sqrt(tempMax - tempMin) *
    ((tempMax + tempMin) / 2 + 17.8)

  // Apply modification to take humidity into account
  return evaporation * Math.pow(1.001 - humidity / 100, 0.2)
}

/**
 * Transforms a text value to another unit using the provided transformation functions.
 * @param textValue The text value to transform, e.g., "30 C" or "2.5 in".
 * @param transforms An object containing transformation functions for various units.
 * @returns The transformed value or undefined if the unit is not recognized.
 */
function transformValue(
  textValue: string,
  transforms: { [value: string]: (value: number) => number }
) {
  const [, value, unit] = textValue.match(/^(\d+)\s*(.*)$/) || []
  if (unit !== undefined && transforms[unit]) {
    const transformed = transforms[unit](Number.parseFloat(value))
    return Number.isNaN(transformed) ? undefined : transformed
  }
}

/**
 * Converts concatenated text segments to Kelvin temperature.
 * @param textValues The text segments to concatenate and convert, e.g., "30", "C" or "75", "F".
 * @returns The converted temperature in Kelvin or undefined if the unit is not recognized.
 */
function toKelvin(...textValues: (string | undefined)[]) {
  return transformValue(textValues.join(''), {
    C: (value: number) => value + 273.15,
    F: (value: number) => (value - 32) / 1.8 + 273.15
  })
}

/**
 * Converts concatenated text segments to millimeters.
 * @param textValues The text segments to concatenate and convert, e.g., "3", "in" or "75", "mm".
 * @returns The converted length in millimeters or undefined if the unit is not recognized.
 */
function toMillimeters(...textValues: (string | undefined)[]) {
  return transformValue(textValues.join(''), {
    in: (value: number) => value * 25.4,
    mm: (value: number) => value
  })
}

/**
 * Set up weather checking functionality for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the weather check is set up.
 */
async function setupWeatherCheck(server: hapi.Server) {
  let runningValves: { entityId: string; until: string }[] = []

  const irrigateSeconds = async (entityId: string) => {
    const valveParams = (await server.plugins.storage.get(
      `irrigation/valves/${entityId}`
    )) as {
      'observed-days': number
      'overshoot-days': number
      'volume-per-minute': string
      'evaporation-factor': number
      'minimal-temperature': string
    }

    const [
      irrigationVolumePerMinute,
      minimalKelvin,
      observedDays,
      overshootDays,
      evaporationFactor
    ] = [
      toMillimeters(valveParams?.['volume-per-minute']),
      toKelvin(valveParams?.['minimal-temperature']),
      valveParams?.['observed-days'],
      valveParams?.['overshoot-days'],
      valveParams?.['evaporation-factor']
    ]

    if (
      [
        irrigationVolumePerMinute,
        minimalKelvin,
        observedDays,
        overshootDays,
        evaporationFactor
      ].some((value) => value === undefined)
    ) {
      console.log(`Some irrigation values of item ${entityId} are missing...`)
      return 0
    }

    // Get irrigation amounts of valve
    const now = dayjs()
    const historyDate = now.subtract(valveParams['observed-days'], 'day')
    const [irrigatedToday, historyIrrigationAmount] =
      await server.plugins.hassConnect.rest
        .get<Pick<State, 'entity_id' | 'state' | 'last_changed'>[][]>(
          `/history/period/${historyDate.toISOString()}?${[
            `end_time=${now.toISOString()}`,
            `filter_entity_id=${entityId}`
          ].join('&')}`
        )
        .then(({ ok, json }): [boolean, number] => {
          if (!ok) {
            // Do not irrigate without history
            return [true, 0]
          }

          const { irrigatedToday, volume } = json!.flat().reduce(
            ({ irrigatedToday, volume, state, last_changed }, record) => {
              const recordDate = dayjs(record.last_changed)
              irrigatedToday ||= state == 'on' && recordDate.isSame(now, 'day')

              if (state == record.state) {
                // Skip
                return {
                  irrigatedToday,
                  volume,
                  state,
                  last_changed
                }
              }

              const addedVolume =
                record.state == 'off'
                  ? ((recordDate.unix() - dayjs(last_changed).unix()) / 60) *
                    irrigationVolumePerMinute!
                  : 0

              return {
                irrigatedToday,
                volume: volume + addedVolume,
                state: record.state,
                last_changed: record.last_changed
              }
            },
            {
              irrigatedToday: false,
              volume: 0,
              state: 'off',
              last_changed: now.toISOString()
            }
          )

          return [irrigatedToday, volume]
        })

    if (irrigatedToday) {
      console.log(`Skip ${entityId} as it had irrigated today...`)
      return 0
    }

    // Get past hydro amounts
    const historyHydroRecords = await server.plugins.storage
      .get(`irrigation/history`)
      .then((records: HydroRecord[]) =>
        (records || []).filter(({ datetime }) => {
          const recordDate = dayjs(datetime)
          return (
            !recordDate.isBefore(historyDate, 'day') &&
            recordDate.isAfter(now, 'day')
          )
        })
      )
    const historyHydroAmount = historyHydroRecords.reduce(
      (summed: number, history) => {
        return (
          summed +
          history.precipitation -
          history.evaporation * valveParams['evaporation-factor']
        )
      },
      0
    )

    // Get future hydro amounts
    const { latitude } = server.app.hassRegistry.getConfig()
    const weatherForecasts = server.app.hassRegistry.getStates(FORECAST_ENTITY)
    for (const weatherForecast of weatherForecasts) {
      const { temperature_unit, precipitation_unit, forecast } =
        weatherForecast.attributes as {
          temperature_unit: 'C' | 'F'
          precipitation_unit: 'in' | 'mm'
          forecast: any[]
        }

      type EvaporationRecordMap = {
        [key: string]: Pick<HydroRecord, 'evaporation' | 'precipitation'>
      }

      const forecastDate = now.add(valveParams['overshoot-days'], 'day')
      const [reachedMinTemp, forecastHydroRecords] = forecast
        .filter(({ datetime }) => !dayjs(datetime).isAfter(forecastDate, 'day'))
        .reduce<[boolean, EvaporationRecordMap]>(
          ([reachedMinTemp, records], forecast) => {
            const key = dayjs(forecast.datetime).format('YYYY-MM-DD')
            if (records[key] === undefined) {
              records[key] = {
                evaporation: 0,
                precipitation: 0
              }
            }

            const convertedTemplow = toKelvin(
              forecast.templow,
              temperature_unit
            )!

            records[key].evaporation += hargreavesSamani(
              forecast.datetime,
              convertedTemplow - 273.15,
              toKelvin(forecast.temperature, temperature_unit)! - 273.15,
              forecast.humidity,
              latitude
            )

            records[key].precipitation += toMillimeters(
              forecast.precipitation,
              precipitation_unit
            )!

            return [
              reachedMinTemp && convertedTemplow >= minimalKelvin!,
              records
            ]
          },
          [true, {}]
        )
      const forecastHydroAmount = Object.values(forecastHydroRecords).reduce(
        (summed, { evaporation: e, precipitation: p }) =>
          summed + p - e * valveParams['evaporation-factor'],
        0
      )

      // Save current hydro record
      const todayRecord = forecastHydroRecords[now.format('YYYY-MM-DD')]
      if (todayRecord) {
        await server.plugins.storage.set('irrigation/history', [
          todayRecord,
          historyHydroRecords.filter(
            ({ datetime }) => !dayjs(datetime).isSame(now, 'day')
          )
        ])
      }

      // Decide if irrigation is needed
      const level =
        historyHydroAmount + historyIrrigationAmount + forecastHydroAmount
      if (
        reachedMinTemp &&
        historyHydroRecords.length >= valveParams['observed-days'] &&
        level < 0
      ) {
        return (-level / irrigationVolumePerMinute!) * 60
      }
    }

    return 0
  }

  const updateRunners = (entityId: string, irrigationSeconds: number) => {
    if (irrigationSeconds == 0) {
      runningValves = runningValves.filter(
        (valve) => valve.entityId != entityId
      )
    } else {
      runningValves = runningValves.map((valve) => {
        if (valve.entityId != entityId) {
          return valve
        }

        return {
          ...valve,
          until: dayjs().add(irrigationSeconds, 'seconds').toISOString()
        }
      })
    }
  }

  server.plugins.schedule.addJob('every 5 minutes', async () => {
    const now = dayjs()
    for (const { entityId, until } of runningValves) {
      if (dayjs(until).isBefore(now)) {
        updateRunners(entityId, 0)
        await server.app.hassRegistry.callService('homeassistant', 'turn_off', {
          service_data: { entity_id: entityId }
        })
      }
    }
  })

  server.events.on(EVENT_HASSREGISTRY.STATE_UPDATED, async (state: State) => {
    if (
      [{ ...VALVE_ENTITY, state: 'off' }, FORECAST_ENTITY].some((criteria) =>
        server.app.hassRegistry.matchesStateFilter(state, criteria)
      )
    ) {
      const valves = server.app.hassRegistry.getStates(VALVE_ENTITY)
      if (valves.some((valve) => valve.state == 'on')) {
        console.log(
          `Skip irrigation check as there is at least one valve irrigating...`
        )
        return
      }

      for (const { entity_id } of valves) {
        const irrigationSeconds = await irrigateSeconds(entity_id)
        updateRunners(entity_id, irrigationSeconds)
        irrigationSeconds &&
          (await server.app.hassRegistry.callService(
            'homeassistant',
            'turn_on',
            {
              service_data: { entity_id }
            }
          ))
        break
      }
    }
  })
}

/**
 * Set up the irrigation-related routes for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the routes are set up.
 */
async function setupIrrigationRoutes(server: hapi.Server) {
  server.route({
    method: 'GET',
    path: '/api/irrigation-valve-items',
    handler: async (request, h) => {
      /*
        const weatherHistory =
          (await server.plugins["app/json-storage"].get(
            "gCore_Irrigation",
            "irrigation/weather-history"
          )) || []

        const weatherForecast =
          (await server.plugins["app/json-storage"].get(
            "gCore_Irrigation",
            "irrigation/weather-forecast"
          )) || []

        const items = await request.server.plugins["app/openhab"].getItem(
          request,
          "gCore_Irrigation_Valves",
          true
        )

        const result = (items.members || []).map(async (item) => {
          const irrigationLevelPerMinute = await server.plugins[
            "app/json-storage"
          ].get(item.name, "irrigation/irrigation-level-per-minute")

          const observedDays = await server.plugins["app/json-storage"].get(
            item.name,
            "irrigation/observed-days"
          )

          const overshootDays = await server.plugins["app/json-storage"].get(
            item.name,
            "irrigation/overshoot-days"
          )

          const evaporationFactor = await server.plugins[
            "app/json-storage"
          ].get(item.name, "irrigation/evaporation-factor")

          const minimalTemperature = await server.plugins[
            "app/json-storage"
          ].get(item.name, "irrigation/minimal-temperature")

          const irrigationHistory =
            (await server.plugins["app/json-storage"].get(
              item.name,
              "irrigation/history"
            )) || {}

          const lastActivation = await server.plugins["app/json-storage"].get(
            item.name,
            "irrigation/last-activation"
          )

          const lastActivationCompleted = await server.plugins[
            "app/json-storage"
          ].get(item.name, "irrigation/last-activation-completed")

          item.jsonStorage = {
            irrigationLevelPerMinute,
            overshootDays,
            evaporationFactor,
            minimalTemperature,
            observedDays,
            series: [
              ...weatherHistory,
              ...weatherForecast
                .slice(0, Math.min(8, weatherForecast.length))
                .map((wf: any) => ({ ...wf, forecast: true })),
            ].map((s) => {
              const irrigation = irrigationHistory[s.date]
              return irrigation ? { ...s, irrigation } : s
            }),
            totalMonthlyIrrigation: Object.keys(irrigationHistory).reduce(
              (amount, date) => amount + irrigationHistory[date],
              0
            ),
            lastActivation,
            lastActivationCompleted,
          }

          return item
        })
        return h.response({ data: await Promise.all(result) }).code(200)
        */
    }
  })

  server.route({
    method: 'POST',
    path: '/api/irrigation-valve-items/{item}',
    options: {
      validate: {
        params: {
          item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
        },
        payload: {
          irrigationValues: Joi.object({
            irrigationLevelPerMinute: Joi.number().min(0).required(),
            overshootDays: Joi.number().min(0).required(),
            evaporationFactor: Joi.number().min(0).required(),
            minimalTemperature: Joi.string()
              .regex(/\d*[FC]/)
              .optional(),
            observedDays: Joi.number().min(0).required()
          }).required()
        }
      }
    },
    handler: async (request, h) => {
      /*
        const { irrigationValues } = request.payload as any
        const {
          irrigationLevelPerMinute,
          overshootDays,
          minimalTemperature,
          evaporationFactor,
          observedDays,
        } = irrigationValues

        await server.plugins["app/json-storage"].set(
          request.params.item,
          "irrigation/irrigation-level-per-minute",
          irrigationLevelPerMinute
        )

        await server.plugins["app/json-storage"].set(
          request.params.item,
          "irrigation/observed-days",
          observedDays
        )

        await server.plugins["app/json-storage"].set(
          request.params.item,
          "irrigation/evaporation-factor",
          evaporationFactor
        )

        await server.plugins["app/json-storage"].set(
          request.params.item,
          "irrigation/minimal-temperature",
          minimalTemperature
        )

        await server.plugins["app/json-storage"].set(
          request.params.item,
          "irrigation/overshoot-days",
          overshootDays
        )
        return h.response({ success: true }).code(200)
        */
    }
  })
}

export default irrigationPlugin
