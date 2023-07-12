import * as hapi from '@hapi/hapi'
import { Connection } from 'home-assistant-js-websocket'
import {
  HOMEASSISTANT_EVENT_TAGS as HOMEASSISTANT_EVENT_TAGS_CONNECT,
  HOMEASSISTANT_EVENT_NAME
} from '../ha-connect.js'

interface StatePayload {
  entity_id: string
  state: string
  last_updated: string
  last_changed: string
  attributes: {
    [key: string]: string | null
  }
}

interface StateChangedPayload {
  entity_id: string
  new_state: StatePayload
  old_state: StatePayload
}

interface EntityPayload {
  original_name: string
  entity_id: string
  device_id: string
  state: StatePayload['state']
  last_updated: StatePayload['last_updated']
  last_changed: StatePayload['last_changed']
  attributes: {
    [key: string]: string | null
  }
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

interface Area {
  id: string
  name: string
}

interface Device {
  id: string
  name: string
  areaId: string
}

interface Entity {
  id: string
  name: string
  deviceId: string
  deviceClass?: string
  state: string
  stateClass?: string
  lastUpdated: string
  lastChanged: string
}

export enum HOMEASSISTANT_EVENT_TAGS {
  REGISTRY_UPDATED = 'registry-updated',
  STATE_CHANGED = 'state-changed'
}

export interface AreaObject extends Area {
  getEntities: Registry['getEntities']
  getDevices: Registry['getDevices']
}

export interface EntityObject extends Entity {
  getDevice: () => ReturnType<Registry['getDevice']>
  getArea: () => ReturnType<Registry['getArea']>
}

export interface DeviceObject extends Device {
  getArea: () => ReturnType<Registry['getArea']>
  getEntities: Registry['getEntities']
}

export class Registry {
  private areas: { [areaId: string]: Area } = {}
  private devices: { [deviceId: string]: Device } = {}
  private entities: { [entityId: string]: Entity } = {}
  private subscriptions: (() => Promise<void>)[] = []

  constructor(private server: hapi.Server) {
    const initialize = () => {
      return Promise.all([this.reinitialize(), this.subscribeUpdates()])
    }

    // Update registry on connection
    this.server.events.on(
      {
        name: HOMEASSISTANT_EVENT_NAME,
        filter: { tags: HOMEASSISTANT_EVENT_TAGS_CONNECT.INITIALLY_CONNECTED }
      },
      initialize
    )
  }

  private async reinitialize() {
    console.log(`Initializing registry...`)
    const connection = await this.server.plugins.hassConnect.globalConnect()

    if (!connection?.connected) {
      console.warn(
        `Could not initialize registry. Not connected to Home Assistant...`
      )
      return
    }

    const [entityConfig, deviceConfig, areaConfig, statesConfig] =
      (await Promise.all(
        [
          'config/entity_registry/list',
          'config/device_registry/list',
          'config/area_registry/list',
          'get_states'
        ].map(async (message) => {
          return connection.sendMessagePromise({
            type: message
          })
        })
      )) as [EntityPayload[], DevicePayload[], AreaPayload[], StatePayload[]]

    this.areas = Object.fromEntries(
      areaConfig.map(({ area_id, name }) => [area_id, { id: area_id, name }])
    )

    this.devices = Object.fromEntries(
      deviceConfig.map(({ id, area_id, name }) => {
        return [id, { id, name, areaId: area_id }]
      })
    )

    const states = Object.fromEntries(
      statesConfig.map(({ entity_id, state, attributes }) => {
        const { state_class, device_class } = attributes || {}
        return [
          entity_id,
          {
            state,
            stateClass: state_class === null ? undefined : state_class,
            deviceClass: device_class === null ? undefined : device_class
          }
        ]
      })
    )

    this.entities = Object.fromEntries(
      entityConfig.map(
        ({
          entity_id,
          original_name,
          device_id,
          last_changed,
          last_updated
        }) => {
          const { stateClass, state, deviceClass } = states[entity_id] || {}
          return [
            entity_id,
            {
              id: entity_id,
              name: original_name,
              deviceId: device_id,
              deviceClass,
              state,
              stateClass,
              lastUpdated: last_updated,
              lastChanged: last_changed
            }
          ]
        }
      )
    )
  }

  private async subscribeUpdates() {
    let connection: Connection | undefined
    try {
      connection = await this.server.plugins.hassConnect.globalConnect()
      if (!connection?.connected) {
        return
      }
    } catch (err) {
      return
    }

    // Unsubscribe old subscriptions
    await Promise.all(this.subscriptions)
    this.subscriptions = []

    console.log(`Subscribe to *_registry_updated events...`)
    for (const eventType of [
      'area_registry_updated',
      'entity_registry_updated',
      'device_registry_updated'
    ]) {
      const subscription = await connection.subscribeMessage(
        async () => {
          await this.reinitialize()
          this.server.events.emit({
            name: HOMEASSISTANT_EVENT_NAME,
            tags: HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
          })
        },
        {
          type: 'subscribe_events',
          event_type: eventType
        }
      )
      this.subscriptions.push(subscription)
    }

    console.log(`Subscribe to state_changes...`)
    const subscription = await connection.subscribeMessage(
      async ({ data: changedState }: { data: StateChangedPayload }) => {
        await this.update(changedState)
        this.server.events.emit(
          {
            name: HOMEASSISTANT_EVENT_NAME,
            tags: HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED
          },
          this.getEntity(changedState.entity_id)
        )
      },
      {
        type: 'subscribe_events',
        event_type: 'state_changed'
      }
    )
    this.subscriptions.push(subscription)
  }

  private async update({
    entity_id: entityId,
    new_state: newState
  }: StateChangedPayload) {
    console.log(`Updating ${entityId} in registry...`)
    const connection = await this.server.plugins.hassConnect.globalConnect()

    if (!connection?.connected) {
      console.warn(
        `Could not update registry. Not connected to Home Assistant...`
      )
      return
    }

    const { state, last_changed, last_updated, attributes } = newState
    const { state_class, device_class } = attributes || {}

    this.entities[entityId] = {
      ...this.entities[entityId],
      deviceClass: device_class == null ? undefined : device_class,
      state,
      stateClass: state_class == null ? undefined : state_class,
      lastChanged: last_changed,
      lastUpdated: last_updated
    }
  }

  public on(
    tags: HOMEASSISTANT_EVENT_TAGS | HOMEASSISTANT_EVENT_TAGS[],
    callback: (entity?: EntityObject) => void
  ) {
    return this.server.events.on(
      { name: HOMEASSISTANT_EVENT_NAME, filter: { tags } },
      callback
    )
  }

  public getArea(areaId: string): AreaObject | undefined {
    return this.areas[areaId] !== undefined
      ? {
          ...this.areas[areaId],
          getEntities: (filter: Parameters<typeof this.getEntities>[0]) => {
            const deviceIds = Object.keys(this.devices)
            return this.getEntities({
              ...filter,
              deviceId: (deviceId) => {
                return deviceId !== undefined && deviceIds.includes(deviceId)
              }
            })
          },
          getDevices: () => this.getDevices({ areaId })
        }
      : undefined
  }

  public getDevice(deviceId: string): DeviceObject | undefined {
    return this.devices[deviceId]
      ? {
          ...this.devices[deviceId],
          getEntities: (filter: Parameters<typeof this.getEntities>[0]) => {
            return this.getEntities({ ...filter, deviceId })
          },
          getArea: () => this.getArea(this.devices[deviceId].areaId)
        }
      : undefined
  }

  public getEntity(entityId: string): EntityObject | undefined {
    return this.entities[entityId]
      ? {
          ...this.entities[entityId],
          getDevice: () => this.getDevice(this.entities[entityId].deviceId),
          getArea: () => {
            const { areaId } =
              this.getDevice(this.entities[entityId].deviceId) || {}
            return areaId ? this.getArea(areaId) : undefined
          }
        }
      : undefined
  }

  public getAreas<K extends keyof Area>(
    filter = {} as Partial<{
      [key in K]: Area[key] | ((value: Area[key]) => boolean)
    }>
  ) {
    const filterEntries = Object.entries(filter)
    return Object.fromEntries(
      Object.values(this.areas)
        .filter((area: any) => {
          return filterEntries.every(([attribute, value]) =>
            typeof value == 'function'
              ? value(area[attribute])
              : area[attribute] == value
          )
        })
        .map(({ id }) => [id, this.getArea(id)!])
    )
  }

  public getDevices<K extends keyof Device>(
    filter = {} as Partial<{
      [key in K]: Device[key] | ((value: Device[key]) => boolean)
    }>
  ) {
    const filterEntries = Object.entries(filter)
    return Object.fromEntries(
      Object.values(this.devices)
        .filter((device: any) => {
          return filterEntries.every(([attribute, value]) =>
            typeof value == 'function'
              ? value(device[attribute])
              : device[attribute] == value
          )
        })
        .map(({ id }) => [id, this.getDevice(id)!])
    )
  }

  public getEntities<K extends keyof Entity>(
    filter = {} as Partial<{
      [key in K]: Entity[key] | ((value: Entity[key]) => boolean)
    }>
  ) {
    const filterEntries = Object.entries(filter)
    return Object.fromEntries(
      Object.values(this.entities)
        .filter((entity: any) => {
          return filterEntries.every(([attribute, value]) =>
            typeof value == 'function'
              ? value(entity[attribute])
              : entity[attribute] == value
          )
        })
        .map(({ id }) => [id, this.getEntity(id)!])
    )
  }
}
