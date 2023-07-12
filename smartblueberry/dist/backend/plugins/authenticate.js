import Joi from 'joi';
import * as Jwt from '@hapi/jwt';
import { v4 as uuid } from 'uuid';
import { Auth } from 'home-assistant-js-websocket';
import { env } from '../index.js';
import Cryptr from 'cryptr';
export const API_AUTH_STATEGY = 'API';
const authenticatePlugin = {
    name: 'authenticate',
    dependencies: ['storage'],
    register: async (server) => {
        if (env.SUPERVISOR_TOKEN) {
            await registerSupervised(server);
            console.log(`Running with supervised authentication...`);
            return;
        }
        await registerBearer(server);
        console.log(`Running with bearer authentication...`);
    }
};
async function registerBearer(server) {
    server.auth.strategy(API_AUTH_STATEGY, 'jwt', {
        keys: env.JWT_SECRET,
        verify: { aud: false, iss: false, sub: false },
        validate: async (artifacts, request, h) => {
            const { id: tokenId, authData: encryptedAuthData } = artifacts.decoded.payload;
            try {
                const CryptrInstance = new Cryptr(env.JWT_SECRET);
                const stringifiedAuthData = CryptrInstance.decrypt(encryptedAuthData);
                const { id, ...authData } = JSON.parse(stringifiedAuthData);
                return {
                    isValid: tokenId === id,
                    credentials: {
                        user: { id, auth: generateAuth(authData) }
                    }
                };
            }
            catch (err) {
                return { isValid: false };
            }
        }
    });
    server.auth.default(API_AUTH_STATEGY);
    server.route({
        method: 'POST',
        path: '/api/authenticate',
        options: {
            auth: { mode: 'try' },
            validate: {
                payload: Joi.object({
                    access_token: Joi.string().required(),
                    refresh_token: Joi.string().required(),
                    expires_in: Joi.number().required(),
                    expires: Joi.number().required()
                }).allow(null)
            }
        },
        handler: authenticateBearer
    });
}
async function authenticateBearer(request, h) {
    const userAuth = (request.payload && generateAuth(request.payload)) ||
        (request.auth.isAuthenticated && request.auth.credentials.user.auth);
    if (userAuth) {
        let validAuth = false;
        let userConnection;
        try {
            userConnection = await request.server.plugins.hassConnect.connect(userAuth);
            validAuth = userConnection.connected;
        }
        catch (err) {
            validAuth = false;
        }
        finally {
            userConnection?.close();
        }
        if (validAuth) {
            const id = uuid();
            const CryptrInstance = new Cryptr(env.JWT_SECRET);
            const encryptedAuthData = CryptrInstance.encrypt(JSON.stringify({
                access_token: userAuth.data.access_token,
                refresh_token: userAuth.data.refresh_token,
                expires_in: userAuth.data.expires_in,
                expires: userAuth.data.expires,
                id
            }));
            const bearer = signJWT({ id, authData: encryptedAuthData });
            return h
                .response({
                success: true,
                mode: 'bearer',
                bearer
            })
                .code(200);
        }
    }
    return h
        .response({
        success: false,
        hassUrl: env.HOMEASSISTANT_URL,
        error: `Could not connect to Home Assistant via ${env.HOMEASSISTANT_URL}`
    })
        .code(request.payload ? 401 : 200);
}
function signJWT(payload) {
    return Jwt.token.generate(payload, {
        key: env.JWT_SECRET,
        algorithm: 'HS512'
    }, {
        iat: false
    });
}
async function registerSupervised(server) {
    server.route({
        method: 'POST',
        path: '/api/authenticate',
        handler: authenticateSupervised
    });
}
async function authenticateSupervised(request, h) {
    return h
        .response({
        success: true,
        mode: 'supervised'
    })
        .code(200);
}
function generateAuth(authData) {
    return new Auth({
        access_token: authData.access_token,
        expires: authData.expires,
        expires_in: authData.expires_in,
        refresh_token: authData.refresh_token,
        clientId: null,
        hassUrl: env.HOMEASSISTANT_URL
    });
}
export default authenticatePlugin;
//# sourceMappingURL=authenticate.js.map