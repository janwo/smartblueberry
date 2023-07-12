import 'dotenv/config';
import Joi from 'joi';
import * as Hapi from '@hapi/hapi';
import { plugin as jwtPlugin } from '@hapi/jwt';
import filesPlugin from './plugins/files.js';
import healthcheckPlugin from './plugins/healthcheck.js';
import storagePlugin from './plugins/storage.js';
import authenticatePlugin from './plugins/authenticate.js';
import themeBuilderPlugin from './plugins/homeassistant/modules/dashboard.js';
import heatingPlugin from './plugins/homeassistant/modules/heating.js';
import presencePlugin from './plugins/homeassistant/modules/presence.js';
import lightPlugin from './plugins/homeassistant/modules/light.js';
import irrigationPlugin from './plugins/homeassistant/modules/irrigation.js';
import haConnectPlugin from './plugins/homeassistant/ha-connect.js';
import haRegistryPlugin from './plugins/homeassistant/registry/index.js';
import { randomUUID } from 'crypto';
import schedulePlugin from './plugins/schedule.js';
export const env = {
    HTTP_PORT: process.env.HTTP_PORT || 8099,
    BUILD: process.env.BUILD || 'production',
    THEMES_DIR: process.env.THEMES_DIR || `data/themes/`,
    CONFIG_DIR: process.env.CONFIG_DIR || `data/`,
    JWT_SECRET: process.env.JWT_SECRET || randomUUID(),
    HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
    SUPERVISOR_REST_URL: process.env.SUPERVISOR_REST_URL || 'http://supervisor/core/api',
    SUPERVISOR_WS_URL: process.env.SUPERVISOR_WS_URL || 'ws://supervisor/core/websocket',
    SUPERVISOR_TOKEN: process.env.SUPERVISOR_TOKEN || undefined,
    CLIENT_NAME: process.env.CLIENT_NAME || 'Smart Blueberry 🫐'
};
const server = Hapi.server({
    port: env.HTTP_PORT,
    host: '0.0.0.0',
    routes: {
        cors: env.BUILD !== 'production',
        validate: {
            failAction: async (request, h, err) => {
                env.BUILD !== 'production' && console.error(err);
                throw err;
            }
        }
    }
});
server.validator(Joi);
await server.register([
    jwtPlugin,
    storagePlugin,
    authenticatePlugin,
    haConnectPlugin,
    haRegistryPlugin,
    themeBuilderPlugin,
    healthcheckPlugin,
    filesPlugin,
    schedulePlugin,
    heatingPlugin,
    presencePlugin,
    lightPlugin,
    irrigationPlugin
]);
await server.plugins.hassConnect.globalConnect();
await server.start();
console.log('Server running on %s', server.info.uri);
process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map