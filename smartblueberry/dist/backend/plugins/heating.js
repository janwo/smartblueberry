import Joi from 'joi';
import dayjs from 'dayjs';
import { HOMEASSISTANT_EVENT_TAGS } from './lib/hass-registry.js';
const OPENABLE_DEVICE_CLASSES = ['door', 'window', 'opening', 'garage_door'];
const HEATING_DEVICE_CLASSES = ['heating'];
async function checkOpenStates(registry) {
    const openEntities = registry.getEntities({});
    const elapsedDevices = Object.values(openEntities)
        .filter(({ lastChanged }) => {
        return dayjs(lastChanged).add(1, 'hour').isBefore(dayjs());
    })
        .map((entity) => entity.getDevice());
    registry.getAreas({});
    const elapsedAreas = elapsedDevices
        .map((device) => device?.getArea())
        .filter((area) => area !== undefined);
    for (const area of elapsedAreas) {
        area?.getEntities({});
    }
}
const heatingPlugin = {
    name: 'heating',
    dependencies: ['hassConnect', 'storage', 'hassRegistry'],
    register: async (server) => {
        server.plugins.hassRegistry.on([
            HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED,
            HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
        ], async (entity) => {
        });
        server.route({
            method: 'GET',
            path: '/api/heating-mode-items',
            handler: async (request, h) => {
            }
        });
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
            }
        });
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
            }
        });
        server.route({
            method: 'GET',
            path: '/api/heating-contact-switchable-items',
            handler: async (request, h) => {
            }
        });
    }
};
export default heatingPlugin;
//# sourceMappingURL=heating.js.map