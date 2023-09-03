import * as hapi from '@hapi/hapi'
import { EVENT_HASSCONNECT } from './connect.js'

export type StatePayloadFilter<K = State> = {
  [L in keyof K]?: L extends 'attributes'
    ? { [M in keyof K[L]]: StatePayloadFilterValue<K[L][M]> }
    : StatePayloadFilterValue<K[L]>
}

type StatePayloadFilterValue<K = string> =
  | K
  | undefined
  | ((value: K) => boolean)

interface StateAttributes {
  [key: string]:
    | string
    | null
    | boolean
    | string[]
    | boolean[]
    | StateAttributes
}

interface StatePayload {
  entity_id: string
  state: string
  last_updated: string
  last_changed: string
  attributes: StateAttributes
}

interface StateChangedPayload {
  entity_id: string
  new_state: StatePayload
  old_state: StatePayload
}

interface EntityPayload {
  entity_id: string
  device_id: string
  area_id: string
}

interface DevicePayload {
  id: string
  area_id: string
  name: string
}

interface AreaPayload {
  area_id: string
  name: string
}

export interface State extends StatePayload {
  deviceId: DevicePayload['id'] | null
  areaId: AreaPayload['area_id'] | null
  deviceName: DevicePayload['name'] | null
  areaName: AreaPayload['name'] | null
}

export enum EVENT_HASSREGISTRY {
  DEVICE_UPDATED = 'hassregistry#device-updated',
  AREA_UPDATED = 'hassregistry#area-updated',
  ENTITY_UPDATED = 'hassregistry#entity-updated',
  STATE_UPDATED = 'hassregistry#state-updated',
  CONFIG_UPDATED = 'hassregistry#config-updated'
}

const TOPICS = {
  DEVICE: {
    rebuild: 'config/device_registry/list',
    subscribe: 'device_registry_updated'
  },
  AREA: {
    rebuild: 'config/area_registry/list',
    subscribe: 'area_registry_updated'
  },
  ENTITY: {
    rebuild: 'config/entity_registry/list',
    subscribe: 'entity_registry_updated'
  },
  STATE: {
    rebuild: 'get_states',
    subscribe: 'state_changed'
  },
  CONFIG: {
    rebuild: 'get_config',
    subscribe: 'core_config_updated'
  }
}

class Registry {
  private areas: { [areaId: string]: AreaPayload } = {}
  private devices: { [deviceId: string]: DevicePayload } = {}
  private entities: { [entityId: string]: EntityPayload } = {}
  private states: { [entityId: string]: StatePayload } = {}
  private config: { [key: string]: any } = {}
  private subscriptions: (() => Promise<void>)[] = []

  constructor(private server: hapi.Server) {
    const initialize = () => {
      return Promise.all([this.rebuild(), this.subscribeUpdates()])
    }

    // Update registry on connection
    this.server.events.on(EVENT_HASSCONNECT.CONNECTED, initialize)
  }

  /**
   * Rebuilds the data for the given topics.
   * @param topics A list of topics to update.
   * @returns Promise that resolves when topics have been rebuilt
   */
  private async rebuild(
    topics = Object.keys(TOPICS) as (keyof typeof TOPICS)[]
  ) {
    console.log(`Rebuild registry...`)

    try {
      const connection = await this.server.plugins.hassConnect.globalConnect()
      await Promise.all(
        topics.map(async (topic) => {
          const results = await connection?.sendMessagePromise({
            type: TOPICS[topic].rebuild
          })

          switch (topic) {
            case 'AREA':
              this.areas = Object.fromEntries(
                (results as AreaPayload[]).map((area) => [area.area_id, area])
              )
              break

            case 'ENTITY':
              this.entities = Object.fromEntries(
                (results as EntityPayload[]).map((entity) => [
                  entity.entity_id,
                  entity
                ])
              )
              break

            case 'DEVICE':
              this.devices = Object.fromEntries(
                (results as DevicePayload[]).map((device) => [
                  device.id,
                  device
                ])
              )
              break

            case 'STATE':
              this.states = Object.fromEntries(
                (results as StatePayload[]).map((state) => [
                  state.entity_id,
                  state
                ])
              )
              break

            case 'CONFIG':
              this.config = results as any
              break
          }
        })
      )
    } catch (err) {
      console.error(
        `Could not initialize registry. Not connected to Home Assistant...`
      )
    }
  }

  /**
   * Updates the state in the registry.
   * @param stateChangedPayload The payload for the state changed event.
   * @returns Promise that resolves when state was updated.
   */
  private async update({
    entity_id: entityId,
    new_state: newState
  }: StateChangedPayload) {
    console.log(`Update state "${entityId}" in registry...`)
    this.states[entityId] = newState
  }

  /**
   * Debounces the given callback.
   * @param callback Function to call when debounced.
   * @param timeout Number of milliseconds to debounce.
   * @returns The result of the debounced function.
   */
  private debounce(callback: (...args: any) => void, timeout = 500) {
    let timer: NodeJS.Timer | undefined

    return (...args: typeof callback.arguments) => {
      if (timer === undefined) {
        return callback.apply(this, args)
      }

      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        callback.apply(this, args)
      }, timeout)
    }
  }

  /**
   * Subscribe to updates from Home Assistant.
   * @returns A Promise that resolves when the subscriptions are set up.
   */
  private async subscribeUpdates() {
    const unsubscribe = async () => {
      await Promise.all(this.subscriptions)
      this.subscriptions = []
    }

    // Unsubscribe old subscriptions
    await unsubscribe()

    try {
      const connection = await this.server.plugins.hassConnect.globalConnect()
      console.log(`Subscribe to *_registry_updated events...`)
      for (const [topic, topicValue] of Object.entries(TOPICS)) {
        let callback = undefined
        switch (topic) {
          case 'STATE':
            callback = async (event: { data: StateChangedPayload }) => {
              await this.update(event.data)
              this.server.events.emit(
                EVENT_HASSREGISTRY.STATE_UPDATED,
                this.convertState(event.data.new_state)
              )
            }
            break

          case 'AREA':
            callback = this.debounce(async (event: { data: AreaPayload }) => {
              await this.rebuild([topic])
              this.server.events.emit(
                EVENT_HASSREGISTRY.AREA_UPDATED,
                event.data.area_id
              )
            })
            break

          case 'ENTITY':
            callback = this.debounce(async (event: { data: EntityPayload }) => {
              await this.rebuild([topic])
              this.server.events.emit(
                EVENT_HASSREGISTRY.ENTITY_UPDATED,
                event.data.entity_id
              )
            })
            break

          case 'DEVICE':
            callback = this.debounce(async (event: { data: DevicePayload }) => {
              await this.rebuild([topic])
              this.server.events.emit(
                EVENT_HASSREGISTRY.DEVICE_UPDATED,
                event.data.id
              )
            })
            break

          case 'CONFIG':
            callback = this.debounce(async (event: { data: any }) => {
              await this.rebuild([topic])
              this.server.events.emit(EVENT_HASSREGISTRY.CONFIG_UPDATED)
            })
            break
        }

        const subscription =
          callback &&
          (await connection?.subscribeMessage(callback, {
            type: 'subscribe_events',
            event_type: topicValue.subscribe
          }))

        if (subscription !== undefined) {
          this.subscriptions.push(subscription)
        }
      }
    } catch (err) {
      // Unsubscribe old subscriptions
      await unsubscribe()
    }
  }

  /**
   * Converts a state payload to a state object.
   * @param statePayload The state payload to convert.
   * @returns The state object.
   */
  private convertState(
    statePayload: StatePayload | undefined
  ): State | undefined {
    if (!statePayload) {
      return undefined
    }

    const { device_id: deviceId } = this.entities[statePayload.entity_id] || {}
    const { area_id: areaId, name: deviceName } = (deviceId &&
      this.devices[deviceId]) || { area_id: null, name: null }
    const { name: areaName } = (areaId && this.areas[areaId]) || {
      name: null
    }

    return {
      ...statePayload,
      deviceName,
      deviceId,
      areaId,
      areaName
    }
  }

  /**
   * Checks if a state matches with the given criteria.
   * @param state The state to check.
   * @param criteria The criteria to check against.
   * @returns True, if the state matches with the given criteria. False, otherwise.
   */
  public matchesStateFilter(
    state: State | undefined,
    criteria: StatePayloadFilter
  ): boolean {
    if (state === undefined) {
      return false
    }

    return Object.entries(criteria).every(([filterKey, filterValue]) => {
      if (filterKey === 'attributes' && typeof filterValue === 'object') {
        return Object.entries(filterValue || {}).every(
          ([attributeKey, attributeValue]) => {
            return typeof attributeValue == 'function'
              ? attributeValue(state[filterKey][attributeKey])
              : attributeValue == state[filterKey][attributeKey]
          }
        )
      }

      return typeof filterValue == 'function'
        ? filterValue(state[filterKey as never])
        : filterValue == state[filterKey as never]
    })
  }

  /**
   * Get the state of an entity.
   * @param entityId The id of the entity
   * @returns The matching state.
   */
  public getState(entityId: string): State | undefined {
    return this.convertState(this.states[entityId])
  }

  /**
   * Checks if the given area exists in the registry.
   * @param areaId The id of the entity.
   * @returns True, if the area exists in the registry. False, otherwise.
   */
  public async hasArea(areaId: string) {
    await this.rebuild()
    return !!this.areas[areaId]
  }

  /**
   * Returns all devices of your instance.
   * @returns List of devices of your instance.
   */
  public getDevices() {
    return Object.values(this.devices)
  }

  /**
   * Checks if the given device exists in the registry.
   * @param deviceId The id of the device.
   * @returns True, if the device exists in the registry. False, otherwise.
   */
  public async hasDevice(deviceId: string) {
    await this.rebuild()
    return !!this.devices[deviceId]
  }

  /**
   * Returns the config of your instance.
   * @returns The config of your instance.
   */
  public getConfig() {
    return this.config
  }

  /**
   * Returns all entities of your instance.
   * @returns List of entities of your instance.
   */
  public getEntities() {
    return Object.values(this.entities)
  }

  /**
   * Checks if the given entity exists in the registry.
   * @param entityId The id of the entity.
   * @returns True, if the entity exists in the registry. False, otherwise.
   */
  public async hasEntity(entityId: string) {
    const result = await this.server.plugins.hassConnect.rest.get(
      `/states/${entityId}`
    )
    return result.ok
  }

  /**
   * Returns all areas of your instance.
   * @returns List of areas of your instance.
   */
  public getAreas() {
    return Object.values(this.areas)
  }

  /**
   * Get all states that match the given criteria.
   * @param filter Partial params to be matched with the state.
   * @returns The matching states.
   */
  public getStates(filter = {} as { [key: string]: any }) {
    return Object.values(this.states)
      .map((state) => {
        const convertedState = this.convertState(state)
        return convertedState && this.matchesStateFilter(convertedState, filter)
          ? convertedState
          : undefined
      })
      .filter((state) => state !== undefined) as State[]
  }

  public async callService(
    domain: string,
    service: string,
    {
      service_data,
      target
    }: {
      service_data?: {
        [key: string]:
          | string
          | boolean
          | number
          | null
          | undefined
          | boolean[]
          | number[]
          | string[]
      }
      target?: {
        entity_id?: string | string[]
        area_id?: string | string[]
        device_id?: string | string[]
      }
    } = {}
  ) {
    const connection = await this.server.plugins.hassConnect.globalConnect()

    return connection?.sendMessagePromise({
      type: 'call_service',
      domain,
      service,
      service_data,
      target
    })
  }

  /**
   * Updates parameters of an entity.
   * @param entityId The id of the entity to update.
   * @param updates The parameters to be updated.
   * @returns The updated entity.
   */
  public async updateEntity(
    entityId: string,
    updates: { [key: string]: string | null }
  ) {
    const connection = await this.server.plugins.hassConnect.globalConnect()
    const entity: { entity_entry: EntityPayload } | undefined =
      await connection?.sendMessagePromise({
        type: 'config/entity_registry/update',
        entity_id: entityId,
        ...updates
      })
    return entity?.entity_entry
  }

  public async deleteEntity(entityId: string) {
    const connection = await this.server.plugins.hassConnect.globalConnect()
    const entity: { entity_entry: EntityPayload } | undefined =
      await connection?.sendMessagePromise({
        type: 'config/entity_registry/delete',
        entity_id: entityId
      })
  }
}

declare module '@hapi/hapi' {
  interface ServerApplicationState {
    hassRegistry: Registry
  }
}

const hassRegistryPlugin: hapi.Plugin<{}> = {
  name: 'hassRegistry',
  dependencies: ['hassConnect'],
  register: async (server: hapi.Server) => {
    server.event(Object.values(EVENT_HASSREGISTRY))
    server.app.hassRegistry = new Registry(server)
  }
}

export default hassRegistryPlugin
