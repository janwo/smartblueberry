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
        server.expose(Registry(server));
        await server.plugins.hassConnect.globalConnect();
    }
};
export default haRegistryPlugin;
function Registry(server) {
    let areas = {};
    let devices = {};
    let entities = {};
    const initialize = async () => {
        console.log(`Initializing registry...`);
        const connection = await server.plugins.hassConnect.globalConnect();
        if (!connection?.connected) {
            console.warn(`Could not initialize registry. Not connected to Home Assistant...`);
            return;
        }
        const [entityConfig, deviceConfig, areaConfig, statesConfig] = (await Promise.all([
            'config/entity_registry/list',
            'config/device_registry/list',
            'config/area_registry/list',
            'get_states'
        ].map(async (message) => {
            return connection.sendMessagePromise({
                type: message
            });
        })));
        areas = Object.fromEntries(areaConfig.map(({ area_id, name }) => [area_id, { id: area_id, name }]));
        devices = Object.fromEntries(deviceConfig.map(({ id, area_id, name }) => {
            return [id, { id, name, areaId: area_id }];
        }));
        const states = Object.fromEntries(statesConfig.map(({ entity_id, state, attributes }) => {
            const { state_class, device_class } = attributes || {};
            return [
                entity_id,
                {
                    state,
                    stateClass: state_class === null ? undefined : state_class,
                    deviceClass: device_class === null ? undefined : device_class
                }
            ];
        }));
        entities = Object.fromEntries(entityConfig.map(({ entity_id, original_name, device_id, last_changed, last_updated }) => {
            const { stateClass, state, deviceClass } = states[entity_id] || {};
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
            ];
        }));
    };
    const update = async ({ entity_id: entityId, new_state: newState }) => {
        const connection = await server.plugins.hassConnect.globalConnect();
        if (!connection?.connected) {
            console.warn(`Could not update registry. Not connected to Home Assistant...`);
            return;
        }
        const { state, last_changed, last_updated, attributes } = newState;
        const { state_class, device_class } = attributes || {};
        entities[entityId] = {
            ...entities[entityId],
            deviceClass: device_class == null ? undefined : device_class,
            state,
            stateClass: state_class == null ? undefined : state_class,
            lastChanged: last_changed,
            lastUpdated: last_updated
        };
    };
    const subscribeUpdates = async () => {
        let connection;
        try {
            connection = await server.plugins.hassConnect.globalConnect();
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
                await initialize();
                server.events.emit({
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
            await update(changedState);
            server.events.emit({
                name: HOMEASSISTANT_EVENT_NAME,
                tags: HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED
            }, getEntity(changedState.entity_id));
        }, {
            type: 'subscribe_events',
            event_type: 'state_changed'
        });
    };
    const getArea = (areaId) => {
        return areas[areaId]
            ? {
                ...areas[areaId],
                getEntities: (filter) => {
                    const deviceIds = Object.keys(devices);
                    return getEntities({
                        ...filter,
                        deviceId: (deviceId) => {
                            return deviceId !== undefined && deviceIds.includes(deviceId);
                        }
                    });
                },
                getDevices: () => getDevices({ areaId })
            }
            : undefined;
    };
    const getDevice = (deviceId) => {
        return devices[deviceId]
            ? {
                ...devices[deviceId],
                getEntities: (filter) => {
                    return getEntities({ ...filter, deviceId });
                },
                getArea: () => getArea(devices[deviceId].areaId)
            }
            : undefined;
    };
    const getEntity = (entityId) => {
        return entities[entityId]
            ? {
                ...entities[entityId],
                getDevice: () => getDevice(entities[entityId].deviceId),
                getArea: () => {
                    const { areaId } = getDevice(entities[entityId].deviceId) || {};
                    return areaId ? getArea(areaId) : undefined;
                }
            }
            : undefined;
    };
    const getAreas = (filter = {}) => {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(areas)
            .filter((area) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(area[attribute])
                : area[attribute] == value);
        })
            .map(({ id }) => [id, getArea(id)]));
    };
    const getDevices = (filter = {}) => {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(devices)
            .filter((device) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(device[attribute])
                : device[attribute] == value);
        })
            .map(({ id }) => [id, getDevice(id)]));
    };
    const getEntities = (filter = {}) => {
        const filterEntries = Object.entries(filter);
        return Object.fromEntries(Object.values(entities)
            .filter((entity) => {
            return filterEntries.every(([attribute, value]) => typeof value == 'function'
                ? value(entity[attribute])
                : entity[attribute] == value);
        })
            .map(({ id }) => [id, getEntity(id)]));
    };
    const on = (tags, callback) => {
        server.events.on({ name: HOMEASSISTANT_EVENT_NAME, filter: { tags } }, callback);
    };
    server.events.on({
        name: HOMEASSISTANT_EVENT_NAME,
        filter: { tags: HOMEASSISTANT_EVENT_TAGS_CONNECT.INITIALLY_CONNECTED }
    }, async () => await Promise.all([initialize(), subscribeUpdates()]));
    return {
        getArea,
        getAreas,
        getDevice,
        getDevices,
        getEntity,
        getEntities,
        on
    };
}
//# sourceMappingURL=hass-registry.js.map