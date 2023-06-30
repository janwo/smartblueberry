import { HOMEASSISTANT_EVENT_TAGS as HOMEASSISTANT_EVENT_TAGS_CONNECT, HOMEASSISTANT_EVENT_NAME } from './hass-connect.js';
export var HOMEASSISTANT_EVENT_TAGS;
(function (HOMEASSISTANT_EVENT_TAGS) {
    HOMEASSISTANT_EVENT_TAGS["REGISTRY_UPDATED"] = "registry-updated";
    HOMEASSISTANT_EVENT_TAGS["STATE_CHANGED"] = "state-changed";
})(HOMEASSISTANT_EVENT_TAGS || (HOMEASSISTANT_EVENT_TAGS = {}));
const haRegistryPlugin = {
    name: 'hassRegistry',
    dependencies: ['hassConnect'],
    register: async (server) => {
        server.expose('registry', new Registry(server));
        server.expose('on', on(server));
        await server.plugins.hassConnect.globalConnection.connect();
    }
};
function on(server) {
    return (tags, callback) => {
        return server.events.on({ name: HOMEASSISTANT_EVENT_NAME, filter: { tags } }, callback);
    };
}
class Registry {
    server;
    areas = {};
    devices = {};
    entities = {};
    constructor(server) {
        this.server = server;
        this.registerEvents();
    }
    async registerEvents() {
        this.server.events.on({
            name: HOMEASSISTANT_EVENT_NAME,
            filter: { tags: HOMEASSISTANT_EVENT_TAGS_CONNECT.INITIALLY_CONNECTED }
        }, async () => await Promise.all([this.initialize(), this.subscribeUpdates()]));
    }
    async initialize() {
        console.log(`Initializing registry...`);
        const connection = await this.server.plugins.hassConnect.globalConnection.connect();
        if (!connection?.connected) {
            console.warn(`Could not initialize registry. Not connected to Home Assistant...`);
            return;
        }
        const [entityConfig, deviceConfig, areaConfig] = (await Promise.all([
            'config/entity_registry/list',
            'config/device_registry/list',
            'config/area_registry/list'
        ].map(async (message) => {
            return connection.sendMessagePromise({
                type: message
            });
        })));
        this.areas = Object.fromEntries(areaConfig.map(({ area_id, name }) => [area_id, { id: area_id, name }]));
        this.devices = Object.fromEntries(deviceConfig.map(({ id, area_id, name }) => {
            return [id, { id, name, areaId: area_id }];
        }));
        this.entities = Object.fromEntries(entityConfig.map(({ entity_id, original_name, device_id, attributes, last_changed, last_updated, state }) => {
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
            ];
        }));
    }
    async update({ entity_id: entityId, new_state }) {
        console.log(`Updating ${entityId} in registry...`);
        const connection = await this.server.plugins.hassConnect.globalConnection.connect();
        if (!connection?.connected) {
            console.warn(`Could not update registry. Not connected to Home Assistant...`);
            return;
        }
        const { state, last_changed, last_updated } = new_state;
        this.entities[entityId] = {
            ...this.entities[entityId],
            state,
            lastChanged: last_changed,
            lastUpdated: last_updated
        };
    }
    async subscribeUpdates() {
        let connection;
        try {
            connection =
                await this.server.plugins.hassConnect.globalConnection.connect();
            if (!connection?.connected) {
                return;
            }
        }
        catch (err) {
            return;
        }
        console.log(`Subscribe to *_registry_updated events...`);
        for (const eventType of [
            'area_registry_updated',
            'entity_registry_updated',
            'device_registry_updated'
        ]) {
            await connection.subscribeMessage(async (event) => {
                await this.server.plugins.hassRegistry.registry.initialize();
                this.server.events.emit({
                    name: HOMEASSISTANT_EVENT_NAME,
                    tags: HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
                });
            }, {
                type: 'subscribe_events',
                event_type: eventType
            });
        }
        console.log(`Subscribe to state_changes...`);
        await connection.subscribeMessage(async ({ data: changedState }) => {
            await this.server.plugins.hassRegistry.registry.update(changedState);
            this.server.events.emit({
                name: HOMEASSISTANT_EVENT_NAME,
                tags: HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED
            }, this.getEntity(changedState.entity_id));
        }, {
            type: 'subscribe_events',
            event_type: 'state_changed'
        });
    }
    getArea(areaId) {
        return this.areas[areaId]
            ? {
                ...this.areas[areaId],
                getEntities: (filter) => {
                    const deviceIds = Object.keys(this.devices);
                    return this.getEntities({
                        ...filter,
                        deviceId: (deviceId) => {
                            return deviceId !== undefined && deviceIds.includes(deviceId);
                        }
                    });
                },
                getDevices: () => this.getDevices({ areaId })
            }
            : undefined;
    }
    getDevice(deviceId) {
        return this.devices[deviceId]
            ? {
                ...this.devices[deviceId],
                getEntities: (filter) => {
                    return this.getEntities({ ...filter, deviceId });
                },
                getArea: () => this.getArea(this.devices[deviceId].areaId)
            }
            : undefined;
    }
    getEntity(entityId) {
        return this.entities[entityId]
            ? {
                ...this.entities[entityId],
                getDevice: () => this.getDevice(this.entities[entityId].deviceId),
                getArea: () => {
                    const { areaId } = this.getDevice(this.entities[entityId].deviceId) || {};
                    return areaId ? this.getArea(areaId) : undefined;
                }
            }
            : undefined;
    }
    getAreas(filter = {}) {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(this.areas)
            .filter((area) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(area[attribute])
                : area[attribute] == value);
        })
            .map(({ id }) => [id, this.getArea(id)]));
    }
    getDevices(filter = {}) {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(this.devices)
            .filter((device) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(device[attribute])
                : device[attribute] == value);
        })
            .map(({ id }) => [id, this.getDevice(id)]));
    }
    getEntities(filter = {}) {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(this.entities)
            .filter((entity) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(entity[attribute])
                : entity[attribute] == value);
        })
            .map(({ id }) => [id, this.getEntity(id)]));
    }
}
export default haRegistryPlugin;
//# sourceMappingURL=hass-registry.js.map