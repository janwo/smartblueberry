import * as hapi from '@hapi/hapi'
import {
  HOMEASSISTANT_EVENT_TAGS as HOMEASSISTANT_EVENT_TAGS_CONNECT,
  HOMEASSISTANT_EVENT_NAME
} from './hass-connect.js'
import { Connection } from 'home-assistant-js-websocket'

interface StateEvent {
  state: string
  last_updated: string
  last_changed: string
}

interface StateChangedEvent {
  entity_id: string
  new_state: StateEvent
  old_state: StateEvent
}

interface EntityConfig {
  original_name: string
  entity_id: string
  device_id: string
  attributes: {
    device_class: string
    [key: string]: string
  }
  state: StateEvent['state']
  last_updated: StateEvent['last_updated']
  last_changed: StateEvent['last_changed']
}

interface DeviceConfig {
  id: string
  area_id: string
  name: string
}

interface AreaConfig {
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
  deviceClass: string
  state: string
  lastUpdated: string
  lastChanged: string
}

export enum HOMEASSISTANT_EVENT_TAGS {
  REGISTRY_UPDATED = 'registry-updated',
  STATE_CHANGED = 'state-changed'
}

declare module '@hapi/hapi' {
  interface PluginProperties {
    hassRegistry: {
      registry: Registry
      on: ReturnType<typeof on>
    }
  }
}

const haRegistryPlugin: hapi.Plugin<{}> = {
  name: 'hassRegistry',
  dependencies: ['hassConnect'],
  register: async (server: hapi.Server) => {
    server.expose('registry', new Registry(server))
    server.expose('on', on(server))

    await server.plugins.hassConnect.globalConnection.connect()
  }
}

function on(server: hapi.Server) {
  return (
    tags: HOMEASSISTANT_EVENT_TAGS | HOMEASSISTANT_EVENT_TAGS[],
    callback: (entity?: EntityObject) => void
  ) => {
    return server.events.on(
      { name: HOMEASSISTANT_EVENT_NAME, filter: { tags } },
      callback
    )
  }
}

export interface AreaObject extends Area {
  getEntities: (filter: Partial<Entity>) => {
    [key: Entity['id']]: EntityObject
  }
  getDevices: (filter: Partial<Device>) => {
    [key: Device['id']]: DeviceObject
  }
}

export interface EntityObject extends Entity {
  getDevice: () => DeviceObject
  getArea: () => AreaObject
}

export interface DeviceObject extends Device {
  getArea: () => AreaObject
  getEntities: (filter: Partial<Entity>) => {
    [key: Entity['id']]: EntityObject
  }
}

export type RegistryObject = Registry

class Registry {
  private areas: { [areaId: string]: Area } = {}
  private devices: { [deviceId: string]: Device } = {}
  private entities: { [entityId: string]: Entity } = {}

  constructor(private server: hapi.Server) {
    this.registerEvents()
  }

  private async registerEvents() {
    this.server.events.on(
      {
        name: HOMEASSISTANT_EVENT_NAME,
        filter: { tags: HOMEASSISTANT_EVENT_TAGS_CONNECT.INITIALLY_CONNECTED }
      },
      async () =>
        await Promise.all([this.initialize(), this.subscribeUpdates()])
    )
  }

  private async initialize() {
    console.log(`Initializing registry...`)
    const connection =
      await this.server.plugins.hassConnect.globalConnection.connect()

    if (!connection?.connected) {
      console.warn(
        `Could not initialize registry. Not connected to Home Assistant...`
      )
      return
    }

    const [entityConfig, deviceConfig, areaConfig] = (await Promise.all(
      [
        'config/entity_registry/list',
        'config/device_registry/list',
        'config/area_registry/list'
      ].map(async (message) => {
        return connection.sendMessagePromise({
          type: message
        })
      })
    )) as [EntityConfig[], DeviceConfig[], AreaConfig[]]

    this.areas = Object.fromEntries(
      areaConfig.map(({ area_id, name }) => [area_id, { id: area_id, name }])
    )

    this.devices = Object.fromEntries(
      deviceConfig.map(({ id, area_id, name }) => {
        return [id, { id, name, areaId: area_id }]
      })
    )

    this.entities = Object.fromEntries(
      entityConfig.map(
        ({
          entity_id,
          original_name,
          device_id,
          attributes,
          last_changed,
          last_updated,
          state
        }) => {
          return [
            entity_id,
            {
              id: entity_id,
              name: original_name,
              state,
              deviceId: device_id,
              deviceClass: attributes?.device_class,
              lastUpdated: last_updated,
              lastChanged: last_changed
            }
          ]
        }
      )
    )
  }

  private async update({ entity_id: entityId, new_state }: StateChangedEvent) {
    console.log(`Updating ${entityId} in registry...`)
    const connection =
      await this.server.plugins.hassConnect.globalConnection.connect()

    if (!connection?.connected) {
      console.warn(
        `Could not update registry. Not connected to Home Assistant...`
      )
      return
    }

    const { state, last_changed, last_updated } = new_state
    this.entities[entityId] = {
      ...this.entities[entityId],
      state,
      lastChanged: last_changed,
      lastUpdated: last_updated
    }
  }

  private async subscribeUpdates() {
    let connection: Connection | undefined
    try {
      connection =
        await this.server.plugins.hassConnect.globalConnection.connect()
      if (!connection?.connected) {
        return
      }
    } catch (err) {
      return
    }

    console.log(`Subscribe to *_registry_updated events...`)
    for (const eventType of [
      'area_registry_updated',
      'entity_registry_updated',
      'device_registry_updated'
    ]) {
      await connection.subscribeMessage(
        async (event) => {
          await this.server.plugins.hassRegistry.registry.initialize()
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
    }

    console.log(`Subscribe to state_changes...`)
    await connection.subscribeMessage(
      async ({ data: changedState }: { data: StateChangedEvent }) => {
        await this.server.plugins.hassRegistry.registry.update(changedState)
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
  }

  public getArea(areaId: string) {
    return this.areas[areaId]
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

  public getDevice(deviceId: string) {
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

  public getEntity(entityId: string) {
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
      [key in K]: Area[K] | ((value: Area[K]) => boolean)
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
      [key in K]: Device[K] | ((value: Device[K]) => boolean)
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
      [key in K]: Entity[K] | ((value: Entity[K]) => boolean)
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

export default haRegistryPlugin
