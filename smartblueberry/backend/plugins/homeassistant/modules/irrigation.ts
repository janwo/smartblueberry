import * as hapi from '@hapi/hapi'
import dayjs from 'dayjs'
import Joi from 'joi'
import { EVENT_HASSREGISTRY, State, StatePayloadFilter } from '../registry.js'
import { EVENT_HASSCONNECT } from '../connect.js'

interface HydroRecordMap {
  [key: string]: {
    evaporation: number
    precipitation: number
    temperature: { max: number; min: number }
  }
}

interface IrrigationRecordMap {
  [key: string]: {
    irrigation: number
    lastChanged: string
    lastState: string
  }
}

interface Forecast {
  datetime: string
  temperature: number
  templow: number
  precipitation: number
  humidity: number
}

interface ValveParams {
  entityId: string
  'observed-days': number
  'overshoot-days': number
  'evaporation-factor': number
  'volume-per-minute': string
  'minimal-temperature': string
}

const VALVE_ENTITY: StatePayloadFilter = {
  entity_id: (entity_id) => /^switch\..*valve.*$/.test(entity_id)
}

const FORECAST_ENTITY: StatePayloadFilter = {
  entity_id: (value: string) => /^weather\./.test(value),
  attributes: {
    temperature_unit: (v) => v !== undefined,
    precipitation_unit: (v) => v !== undefined
  }
}

const DEFAULTS = {
  overshootDays: 3,
  observedDays: 3,
  evaporationFactor: 1,
  volumePerMinute: '1mm',
  minimalTemperature: '5C'
}

const EVENTS = {
  checkIrrigation: (server: hapi.Server) =>
    `${server.plugins.options.prefix}_check_irrigation`
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
 * @param tempMin The minimum temperature in Kelvin.
 * @param tempMax The maximum temperature in Kelvin.
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
  // Conversions
  tempMin -= 273.15
  tempMax -= 273.15
  const radians = latitude * (Math.PI / 180)
  const julianDate = Math.floor(
    dayjs(date).startOf('day').unix() / 86400 + 2440587.5
  )

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
  const [, value, unit] = textValue.match(/^(\d+\.?\d*)\s*°?(.*)$/) || []
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
 * Retrieve the valve parameters for a given valve entity.
 * @param server The Hapi server instance.
 * @param entityId The entityId of the valve.
 * @returns The valve parameters of that entity.
 */
async function getValveParams(server: hapi.Server, entityId: string) {
  return await server.plugins.storage
    .get<ValveParams[]>(`irrigation/valves`)
    .then((params) => {
      return (params || []).find((v) => v.entityId === entityId)
    })
    .then((valveParams) => {
      const params = {
        irrigationVolumePerMinute:
          valveParams?.['volume-per-minute'] !== undefined
            ? valveParams['volume-per-minute']
            : DEFAULTS.volumePerMinute,
        minimalTemperature:
          valveParams?.['minimal-temperature'] !== undefined
            ? valveParams['minimal-temperature']
            : DEFAULTS.minimalTemperature,
        observedDays:
          valveParams?.['observed-days'] !== undefined
            ? valveParams['observed-days']
            : DEFAULTS.observedDays,
        overshootDays:
          valveParams?.['overshoot-days'] !== undefined
            ? valveParams['overshoot-days']
            : DEFAULTS.overshootDays,
        evaporationFactor:
          valveParams?.['evaporation-factor'] !== undefined
            ? valveParams['evaporation-factor']
            : DEFAULTS.evaporationFactor
      }

      const calculated = {
        irrigationVolumePerMinute: toMillimeters(
          params.irrigationVolumePerMinute
        )!,
        minimalKelvin: toKelvin(params.minimalTemperature)!
      }

      return [params, calculated] as [typeof params, typeof calculated]
    })
}

/**
 * Get the past irrigation values for a given valve entity.
 * @param server  The Hapi server instance.
 * @param entityId The entityId of the valve.
 * @param sinceDay Oldest date for which to retrieve data.
 * @param irrigationVolumePerMinute The irrigation volume per minute of the valve in mm/min.
 * @returns The past irrigation data of the valve in mm/day.
 */
async function getPastIrrigationRecords(
  server: hapi.Server,
  entityId: string,
  sinceDay: string,
  irrigationVolumePerMinute: number
) {
  // Get irrigation amounts of valve
  const now = dayjs()
  return await server.plugins.hassConnect.rest
    .get<Pick<State, 'entity_id' | 'state' | 'last_changed'>[][]>(
      `/history/period/${dayjs(sinceDay).startOf('day').toISOString()}?${[
        `end_time=${now.toISOString()}`,
        `filter_entity_id=${entityId}`
      ].join('&')}`
    )
        .then(({ ok, json }) => {
          const recordMap = (ok ? json! : [])
            .flat()
            .reduce(
              (recordMap: IrrigationRecordMap, newRecord, index, array) => {
                const recordDate = dayjs(newRecord.last_changed)
                const recordKey = recordDate.format('YYYY-MM-DD')
                let isFirstOfDay = recordMap[recordKey] === undefined
                recordMap[recordKey] = isFirstOfDay
                  ? {
                      irrigation: 0,
                      lastChanged: recordDate.startOf('day').toISOString(),
                      lastState: newRecord.state === 'off' ? 'on' : 'off'
                    }
                  : {
                      ...recordMap[recordKey],
                      lastChanged: newRecord.last_changed,
                      lastState: newRecord.state
                    }

                recordMap[recordKey].irrigation +=
                  newRecord.state === 'off'
                    ? ((recordDate.unix() -
                        dayjs(recordMap[recordKey].lastChanged).unix()) /
                        60) *
                      irrigationVolumePerMinute
                    : 0

                let isLastRecord = array.length - 1 === index
                if (isLastRecord) {
                  recordMap = Object.fromEntries(
                    Object.entries(recordMap).map(([key, value]) => {
                      if (value.lastState === 'on') {
                        const recordDate = dayjs(value.lastChanged)
                        const recordDateEndOfDay = recordDate.endOf('day')
                        value.irrigation +=
                          ((recordDateEndOfDay.unix() - recordDate.unix()) /
                            60) *
                          irrigationVolumePerMinute
                      }
                      return [key, value]
                    })
                  )
                }

                return recordMap
              },
              {}
            )

          const amount = Object.values(recordMap).reduce(
            (summed, next) => summed + next.irrigation,
            0
          )

          return [amount, recordMap] as [number, IrrigationRecordMap]
        })
}

/**
 * Retreive the past hydro information of a given interval and evaporation factor.
 * @param server The Hapi server instance.
 * @param sinceDay Oldest date for which to retrieve data.
 * @param evaporationFactor The evaporation factor of the valves soil.
 * @returns The past hydro data in mm/day and K.
 */
async function getPastHydroRecords(
  server: hapi.Server,
  sinceDay: string,
  evaporationFactor: number
) {
  const today = dayjs()
  const historyDate = dayjs(sinceDay)
  // Get past hydro amounts
  return await server.plugins.storage
    .get('irrigation/history')
    .then((recordMap: HydroRecordMap) => {
      recordMap = Object.fromEntries(
        Object.entries(recordMap || {})
          .filter(([key]) => {
            const recordDate = dayjs(key)
            return (
              recordDate.isBefore(historyDate, 'day') &&
              !recordDate.isAfter(today, 'day')
            )
          })
          .map(([key, value]) => [
            key,
            { ...value, evaporation: value.evaporation * evaporationFactor }
          ])
      )

      const amount = Object.values(recordMap).reduce(
        (summed: number, history) => {
          return summed + history.precipitation - history.evaporation
        },
        0
      )
      return [amount, recordMap] as [number, HydroRecordMap]
    })
}

/**
 * Retreive the future hydro information of a given interval and evaporation factor.
 * @param server The Hapi server instance.
 * @param untilDay Date until the data should be retrieved.
 * @param evaporationFactor The evaporation factor of the valves soil.
 * @returns The future hydro data in mm/day and K.
 */
async function getFutureHydroRecords(
  server: hapi.Server,
  untilDay: string,
  evaporationFactor: number
) {
  console.log('Get forecast to calculate future hydro records...')
  const futureDate = dayjs(untilDay)
  const { latitude } = server.app.hassRegistry.getConfig()
  const weatherForecasts = server.app.hassRegistry.getStates(FORECAST_ENTITY)
  const recordMaps = await Promise.all(
    weatherForecasts.map(async (weatherEntity) => {
      const { temperature_unit, precipitation_unit } =
        weatherEntity.attributes as {
          temperature_unit: '°C' | '°F'
          precipitation_unit: 'in' | 'mm'
        }

      const forecastResponse = await server.app.hassRegistry.callService<{
        result?: { response: { [key: string]: { forecast: Forecast[] } } }
      }>('weather', 'get_forecasts', {
        service_data: { type: 'daily' },
        return_response: true,
        target: weatherEntity
      })

      const recordMap =
        forecastResponse?.result?.response[weatherEntity.entity_id]?.forecast
          .filter(({ datetime }) => !dayjs(datetime).isAfter(futureDate, 'day'))
          .reduce((recordMap, forecast) => {
            const forecastDay = dayjs(forecast.datetime)
            const forecastKey = forecastDay.format('YYYY-MM-DD')
            if (recordMap[forecastKey] === undefined) {
              recordMap[forecastKey] = {
                evaporation: 0,
                precipitation: 0,
                temperature: { min: Number.MAX_VALUE, max: -Number.MAX_VALUE }
              }
            }

            const minTemperature =
              toKelvin(forecast.templow.toString(), temperature_unit) ||
              Number.MAX_VALUE
            recordMap[forecastKey].temperature.min = Math.min(
              minTemperature,
              recordMap[forecastKey].temperature.min
            )

            const maxTemperature =
              toKelvin(forecast.temperature.toString(), temperature_unit) ||
              -Number.MAX_VALUE
            recordMap[forecastKey].temperature.max = Math.max(
              maxTemperature,
              recordMap[forecastKey].temperature.max
            )

            recordMap[forecastKey].evaporation +=
              hargreavesSamani(
                forecastDay,
                minTemperature,
                maxTemperature,
                forecast.humidity,
                latitude
              ) * evaporationFactor

            recordMap[forecastKey].precipitation =
              toMillimeters(
                forecast.precipitation.toString(),
                precipitation_unit
              ) || 0

            return recordMap
          }, {} as HydroRecordMap) || {}

      return {
        recordMap,
        amount: Object.values(recordMap).reduce(
          (summed: number, future) =>
            summed + future.precipitation - future.evaporation,
          0
        )
      }
    })
  )

  const classified = recordMaps.sort((a, b) => b.amount - a.amount).pop() || {
    amount: 0,
    recordMap: {}
  }

  return [classified.amount, classified.recordMap] as [number, HydroRecordMap]
}

/**
 * Retrieve the needed irrigation time of a given valve to counter the evaporation.
 * @param server The Hapi server instance.
 * @param entityId The entityId of the valve.
 * @returns The number of seconds of irrigation time.
 */
async function irrigateSeconds(server: hapi.Server, entityId: string) {
  const [valveParams, calculatedValveParams] = await getValveParams(
    server,
    entityId
  )

  if (!valveParams || !calculatedValveParams) {
    console.log(`Some irrigation values of item ${entityId} are missing...`)
    return 0
  }

  const now = dayjs()
  const sinceDay = now.subtract(valveParams.observedDays, 'day')
  const untilDay = now.add(valveParams.overshootDays, 'day')
  const [nowRecordKey, sinceDayRecordKey, untilDayRecordKey] = [
    now,
    sinceDay,
    untilDay
  ].map((d) => d.format('YYYY-MM-DD'))

  // Get past irrigation amounts of valve
  const [pastIrrigationAmount, pastIrrigationRecords] =
    await getPastIrrigationRecords(
      server,
      entityId,
      sinceDay.toISOString(),
      calculatedValveParams.irrigationVolumePerMinute
    )
  if (pastIrrigationRecords[nowRecordKey]?.irrigation) {
    console.log(`Skip ${entityId} as it had irrigated today...`)
    return 0
  }

  // Get hydro amounts
  const [pastHydroAmount, pastHydroRecords] = await getPastHydroRecords(
    server,
    sinceDay.toISOString(),
    valveParams.evaporationFactor
  )
  const [maxFutureHydroAmount, maxFutureHydroRecord] =
    await getFutureHydroRecords(
      server,
      untilDay.toISOString(),
      valveParams.evaporationFactor
    )

  // Save current hydro record
  if (maxFutureHydroRecord[nowRecordKey]) {
    await server.plugins.storage.set('irrigation/history', {
      ...maxFutureHydroRecord[nowRecordKey],
      ...Object.fromEntries(
        Object.entries(pastHydroRecords).filter(
          ([key]) => !dayjs(key).isSame(now, 'day')
        )
      )
    })
  }

  // Decide if irrigation is needed
  const irrigationAmount = -(
    pastHydroAmount +
    pastIrrigationAmount +
    maxFutureHydroAmount
  )
  const reachedMinimalTemperature =
    Math.min(
      ...Object.values(maxFutureHydroRecord).map((mfr) => mfr.temperature.min)
    ) > calculatedValveParams.minimalKelvin
  if (
    reachedMinimalTemperature &&
    pastHydroRecords[sinceDayRecordKey] !== undefined &&
    maxFutureHydroRecord[untilDayRecordKey] !== undefined &&
    irrigationAmount > 0
  ) {
    return (
      (irrigationAmount / calculatedValveParams.irrigationVolumePerMinute) * 60
    )
  }

  return 0
}

/**
 * Set up weather checking functionality for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the weather check is set up.
 */
async function setupWeatherCheck(server: hapi.Server) {
  let runningValves: { entityId: string; until: string }[] = []

  const checkValves = async () => {
    console.log('Checking irrigation valves...')
    const valves = server.app.hassRegistry.getStates(VALVE_ENTITY)
    if (valves.some((valve) => valve.state == 'on')) {
      console.log(
        `Skip irrigation check as there is at least one valve irrigating...`
      )
      return
    }

    for (const { entity_id } of valves) {
      const irrigationSeconds = await irrigateSeconds(server, entity_id)
      updateRunners(entity_id, irrigationSeconds)
      irrigationSeconds &&
        (await server.app.hassRegistry.callService('homeassistant', 'turn_on', {
          service_data: { entity_id }
        }))
      break
    }
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

  server.events.on(EVENT_HASSCONNECT.CONNECTED, async () => {
    const connection = await server.plugins.hassConnect.globalConnect()
    await connection?.subscribeMessage(checkValves, {
      type: 'subscribe_events',
      event_type: EVENTS.checkIrrigation(server)
    })
  })

  server.events.on(EVENT_HASSREGISTRY.STATE_UPDATED, async (state: State) => {
    if (
      server.app.hassRegistry.matchesStateFilter(state, {
        ...VALVE_ENTITY,
        state: 'off'
      }) ||
      (server.app.hassRegistry.matchesStateFilter(state, FORECAST_ENTITY) &&
        (await server.plugins.storage.get(
          'irrigation/triggers/forecast-updates'
        )))
    ) {
      checkValves()
    }
  })
}

async function irrigationValvePayload(server: hapi.Server, entityId: string) {
  const valveState = server.app.hassRegistry.getState(entityId)
  const [valveParam, calculatedValveParams] = await getValveParams(
    server,
    entityId
  )

  if (!valveState || !valveParam || !calculatedValveParams) {
    return { entityId, params: {}, series: [], amounts: {} }
  }

  const now = dayjs()
  const untilDay = now.add(valveParam.overshootDays, 'days')
  const sinceDay = now.subtract(valveParam.observedDays, 'days')

  const [
    [pastHydroAmount, pastHydroRecords],
    [futureHydroAmount, futureHydroRecords],
    [pastIrrigationAmount, irrigationRecords],
    futureIrrigationAmount
  ] = await Promise.all([
    getPastHydroRecords(
      server,
      sinceDay.toISOString(),
      valveParam.evaporationFactor
    ),
    getFutureHydroRecords(
      server,
      untilDay.toISOString(),
      valveParam.evaporationFactor
    ),
    getPastIrrigationRecords(
      server,
      entityId,
      sinceDay.toISOString(),
      calculatedValveParams.irrigationVolumePerMinute
    ),
    irrigateSeconds(server, entityId)
  ])

  const series = Object.entries({
    ...pastHydroRecords,
    ...futureHydroRecords
  }).map(([datetime, value]) => ({
    datetime,
    precipitation: value.precipitation,
    temperature: {
      max: value.temperature.max,
      min: value.temperature.min
    },
    evaporation: value.evaporation,
    irrigation: irrigationRecords[datetime]?.irrigation || 0
  }))

  return {
    entityId,
    entityName: valveState.attributes.friendly_name,
    params: valveParam,
    amounts: {
      pastHydro: pastHydroAmount,
      futureHydro: futureHydroAmount,
      pastIrrigation: pastIrrigationAmount,
      futureIrrigation: futureIrrigationAmount
    },
    series
  }
}

/**
 * Set up the irrigation-related routes for the Hapi server.
 * @param server The Hapi server instance.
 * @returns A Promise that resolves when the routes are set up.
 */
async function setupIrrigationRoutes(server: hapi.Server) {
  server.route({
    method: 'GET',
    path: '/api/irrigation-valves',
    handler: async (request, h) => {
      const valves = server.app.hassRegistry.getStates(VALVE_ENTITY)
      const valvePayloads = await Promise.all(
        valves.map(({ entity_id }) => irrigationValvePayload(server, entity_id))
      )

      return h.response(valvePayloads).code(200)
    }
  })

  server.route({
    method: 'POST',
    path: '/api/irrigation-valves',
    options: {
      validate: {
        payload: {
          entityId: Joi.string().required(),
          params: Joi.object({
            irrigationVolumePerMinute: Joi.string()
              .regex(/^\d+\s?(in|mm)$/i)
              .required(),
            overshootDays: Joi.number().min(0).required(),
            evaporationFactor: Joi.number().min(0).required(),
            minimalTemperature: Joi.string()
              .regex(/^\d+\s?[FC]$/i)
              .required(),
            observedDays: Joi.number().min(0).required()
          }).required()
        }
      }
    },
    handler: async (request, h) => {
      const { params, entityId } = request.payload as any
      const {
        irrigationVolumePerMinute,
        overshootDays,
        minimalTemperature,
        evaporationFactor,
        observedDays
      } = params

      let valveParams =
        (await server.plugins.storage.get<ValveParams[]>(
          'irrigation/valves'
        )) || []

      await server.plugins.storage.set('irrigation/valves', [
        {
          entityId,
          'minimal-temperature': minimalTemperature
            .replace(' ', '')
            .toUpperCase(),
          'volume-per-minute': irrigationVolumePerMinute
            .replace(' ', '')
            .toLowerCase(),
          'overshoot-days': overshootDays,
          'observed-days': observedDays,
          'evaporation-factor': evaporationFactor
        },
        ...valveParams.filter((valveParam) => !valveParam.entityId)
      ])

      const valvePayload = await irrigationValvePayload(server, entityId)
      return h.response(valvePayload).code(200)
    }
  })
  server.route({
    method: 'POST',
    path: '/api/irrigation-features',
    options: {
      validate: {
        payload: {
          checkOnForecastUpdates: Joi.boolean().required()
        }
      }
    },
    handler: async (request, h) => {
      const { checkOnForecastUpdates } = request.payload as any
      await server.plugins.storage.set(
        'irrigation/triggers/forecast-updates',
        checkOnForecastUpdates
      )

      return h.response({ checkOnForecastUpdates }).code(200)
    }
  })

  server.route({
    method: 'GET',
    path: '/api/irrigation-features',
    handler: async (request, h) => {
      const checkOnForecastUpdates =
        (await server.plugins.storage.get(
          'irrigation/triggers/forecast-updates'
        )) || false

      return h.response({ checkOnForecastUpdates }).code(200)
    }
  })
}

export default irrigationPlugin
