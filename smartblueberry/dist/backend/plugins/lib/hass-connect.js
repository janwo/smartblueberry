import { ERR_INVALID_AUTH, MSG_TYPE_AUTH_INVALID, MSG_TYPE_AUTH_OK, createConnection, createLongLivedTokenAuth } from 'home-assistant-js-websocket';
import WebSocket from 'ws';
import { env } from '../../index.js';
import { v4 as uuid } from 'uuid';
export const HOMEASSISTANT_EVENT_NAME = 'homeassistant-event';
export var HOMEASSISTANT_EVENT_TAGS;
(function (HOMEASSISTANT_EVENT_TAGS) {
    HOMEASSISTANT_EVENT_TAGS["CONNECTED"] = "connected";
    HOMEASSISTANT_EVENT_TAGS["DISCONNECTED"] = "disconnected";
    HOMEASSISTANT_EVENT_TAGS["INITIALLY_CONNECTED"] = "initially-connected";
})(HOMEASSISTANT_EVENT_TAGS || (HOMEASSISTANT_EVENT_TAGS = {}));
const haConnectPlugin = {
    name: 'hassConnect',
    dependencies: ['storage'],
    register: async (server) => {
        server.event({ name: HOMEASSISTANT_EVENT_NAME });
        server.expose(ConnectionHelper(server));
        server.route({
            method: 'GET',
            path: '/api/global-connection',
            handler: getGlobalConnection
        });
        if (env.SUPERVISOR_TOKEN === undefined) {
            server.route({
                method: 'POST',
                path: '/api/set-global-connection',
                handler: setGlobalConnection
            });
            server.route({
                method: 'POST',
                path: '/api/unset-global-connection',
                handler: unsetGlobalConnection
            });
        }
    }
};
async function setGlobalConnection(request, h) {
    const userAuth = request.auth.credentials.user.auth;
    let userConnection;
    try {
        userConnection = await request.server.plugins.hassConnect.connect(userAuth);
        const clientName = `${env.CLIENT_NAME} (${uuid()})`;
        const accessToken = await userConnection.sendMessagePromise({
            type: 'auth/long_lived_access_token',
            client_name: clientName,
            lifespan: 365 * 10
        });
        const connection = await request.server.plugins.hassConnect.globalConnect(accessToken);
        await request.server.plugins.storage.set(`global-connection/client-name`, clientName);
        return h
            .response({ connected: !!connection?.connected, client_name: clientName })
            .code(accessToken ? 200 : 400);
    }
    catch (err) {
        return h.response().code(400);
    }
    finally {
        userConnection?.close();
    }
}
async function unsetGlobalConnection(request, h) {
    const globalConnection = await request.server.plugins.hassConnect.globalConnect();
    globalConnection?.close();
    await request.server.plugins.storage.delete('global-connection');
    return h.response({ connected: false, client_name: undefined }).code(200);
}
async function getGlobalConnection(request, h) {
    const globalConnection = await request.server.plugins.hassConnect.globalConnect();
    const clientName = env.SUPERVISOR_TOKEN
        ? 'Supervisor'
        : await request.server.plugins.storage.get(`global-connection/client-name`);
    return h
        .response({
        connected: globalConnection?.connected || false,
        client_name: clientName
    })
        .code(200);
}
export default haConnectPlugin;
function ConnectionHelper(server) {
    let globalConnection = undefined;
    const connect = async (auth) => {
        return new Promise(async (resolve, reject) => {
            try {
                const connection = await createConnection({
                    createSocket: () => createSocket(auth)
                });
                resolve(connection);
            }
            catch (err) {
                reject(err);
            }
        });
    };
    const globalConnect = async (reauthenticateWithAccessToken = undefined) => {
        if (!reauthenticateWithAccessToken && globalConnection?.connected) {
            return globalConnection;
        }
        const accessToken = env.SUPERVISOR_TOKEN ||
            reauthenticateWithAccessToken ||
            (await server.plugins.storage.get(`global-connection/access-token`));
        if (accessToken) {
            const auth = createLongLivedTokenAuth(env.HOMEASSISTANT_URL, accessToken);
            globalConnection?.close();
            globalConnection = await connect(auth);
            globalConnection?.addEventListener('ready', async () => {
                console.log(`Connected to home assistant...`);
                server.events.emit({
                    name: HOMEASSISTANT_EVENT_NAME,
                    tags: HOMEASSISTANT_EVENT_TAGS.CONNECTED
                });
            });
            globalConnection?.addEventListener('disconnected', () => {
                console.log(`Disconnected from home assistant...`);
                server.events.emit({
                    name: HOMEASSISTANT_EVENT_NAME,
                    tags: HOMEASSISTANT_EVENT_TAGS.DISCONNECTED
                });
            });
            console.log(`Initially connected to home assistant...`);
            server.events.emit({
                name: HOMEASSISTANT_EVENT_NAME,
                tags: [
                    HOMEASSISTANT_EVENT_TAGS.CONNECTED,
                    HOMEASSISTANT_EVENT_TAGS.INITIALLY_CONNECTED
                ]
            });
            if (reauthenticateWithAccessToken) {
                await server.plugins.storage.set(`global-connection/access-token`, accessToken);
            }
            return globalConnection;
        }
        if (reauthenticateWithAccessToken !== undefined) {
            throw new Error(`No auth data found!`);
        }
        return undefined;
    };
    const createSocket = async (auth) => {
        return new Promise((resolve, reject) => {
            let invalidAuth = false;
            let retries = 0;
            const connect = () => {
                const socket = new WebSocket(env.SUPERVISOR_TOKEN ? env.SUPERVISOR_WS_URL : auth.wsUrl, {
                    rejectUnauthorized: true
                });
                const onCloseOrError = (err) => {
                    if (invalidAuth) {
                        reject(ERR_INVALID_AUTH);
                        return;
                    }
                    setTimeout(() => connect(), retries * retries * 1000);
                };
                const onOpen = async () => {
                    try {
                        auth.expired && (await auth.refreshAccessToken());
                        socket.send(JSON.stringify({
                            type: 'auth',
                            access_token: env.SUPERVISOR_TOKEN || auth.accessToken
                        }));
                    }
                    catch (err) {
                        invalidAuth = err === ERR_INVALID_AUTH;
                        socket.close();
                    }
                };
                const handleMessage = (event) => {
                    const { type } = JSON.parse(event.toString());
                    switch (type) {
                        case MSG_TYPE_AUTH_INVALID:
                            invalidAuth = true;
                            socket.close();
                            reject(new Error(`Auth is invalid`));
                            break;
                        case MSG_TYPE_AUTH_OK:
                            invalidAuth = false;
                            retries = 0;
                            socket.off('open', onOpen);
                            socket.off('message', handleMessage);
                            socket.off('close', onCloseOrError);
                            socket.off('error', onCloseOrError);
                            resolve(socket);
                            break;
                    }
                };
                socket.on('open', onOpen);
                socket.on('message', handleMessage);
                socket.on('close', onCloseOrError);
                socket.on('error', onCloseOrError);
                retries++;
            };
            return connect();
        });
    };
    return {
        connect,
        globalConnect
    };
}
//# sourceMappingURL=hass-connect.js.map