import { HOMEASSISTANT_EVENT_TAGS } from './lib/hass-registry.js';
const lightPlugin = {
    name: 'light',
    dependencies: ['storage'],
    register: async (server) => {
        server.plugins.hassRegistry.on([
            HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED,
            HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
        ], async (entity) => {
        });
        server.route({
            method: 'GET',
            path: '/api/light-switchable-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/light-measurement-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/light-astro-items',
            handler: async (request, h) => {
            }
        });
    }
};
export default lightPlugin;
//# sourceMappingURL=light.js.map