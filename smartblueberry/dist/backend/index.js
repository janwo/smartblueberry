import 'dotenv/config';
import Joi from 'joi';
import * as Hapi from '@hapi/hapi';
import { plugin as jwtPlugin } from '@hapi/jwt';
import filesPlugin from './plugins/lib/files.js';
import healthcheckPlugin from './plugins/lib/healthcheck.js';
import storagePlugin from './plugins/lib/storage.js';
import authenticatePlugin from './plugins/lib/authenticate.js';
import themeBuilderPlugin from './plugins/lib/theme-builder.js';
import heatingPlugin from './plugins/heating.js';
import presencePlugin from './plugins/presence.js';
import securityPlugin from './plugins/security.js';
import lightPlugin from './plugins/light.js';
import irrigationPlugin from './plugins/irrigation.js';
import haConnectPlugin from './plugins/lib/hass-connect.js';
import haRegistryPlugin from './plugins/lib/hass-registry.js';
import { randomUUID } from 'crypto';
export const env = {
    HTTP_PORT: process.env.HTTP_PORT || 8099,
    BUILD: process.env.BUILD || 'production',
    THEMES_DIR: process.env.THEMES_DIR || `data/themes/`,
    CONFIG_DIR: process.env.CONFIG_DIR || `data/`,
    JWT_SECRET: process.env.JWT_SECRET || randomUUID(),
    HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
    SUPERVISOR_WS_URL: process.env.WS_URL || 'ws://supervisor/core/websocket',
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
    heatingPlugin,
    presencePlugin,
    securityPlugin,
    lightPlugin,
    irrigationPlugin
]);
await server.start();
console.log('Server running on %s', server.info.uri);
process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map