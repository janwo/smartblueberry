import { ERR_INVALID_AUTH, MSG_TYPE_AUTH_INVALID, MSG_TYPE_AUTH_OK, createConnection, createLongLivedTokenAuth } from 'home-assistant-js-websocket';
import WebSocket from 'ws';
import { env } from '../../index.js';
import { v4 as uuid } from 'uuid';
let globalConnection = undefined;
const haConnectPlugin = {
    name: 'app/ha-connect',
    dependencies: ['app/storage'],
    register: async (server) => {
        const resolveGlobalConnection = (reauthenticateWithAccessToken) => {
            return new Promise(async (resolve, reject) => {
                if (!reauthenticateWithAccessToken && globalConnection?.connected) {
                    return resolve(globalConnection);
                }
                const accessToken = reauthenticateWithAccessToken ||
                    (await server.plugins['app/storage'].get(`global-connection/access-token`));
                if (accessToken) {
                    const auth = createLongLivedTokenAuth(env.HOMEASSISTANT_URL, accessToken);
                    try {
                        globalConnection && globalConnection?.close();
                        globalConnection = await connect(auth);
                        if (reauthenticateWithAccessToken) {
                            await server.plugins['app/storage'].set(`global-connection/access-token`, accessToken);
                        }
                        return resolve(globalConnection);
                    }
                    catch (err) {
                        return reject(err);
                    }
                }
                return reauthenticateWithAccessToken
                    ? reject(new Error(`No auth data found!`))
                    : resolve(undefined);
            });
        };
        server.expose('globalConnection', resolveGlobalConnection);
        server.expose('connect', connect);
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
        server.route({
            method: 'GET',
            path: '/api/global-connection',
            handler: getGlobalConnection
        });
    }
};
async function connect(auth) {
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
}
async function setGlobalConnection(request, h) {
    const userAuth = request.auth.credentials.user.auth;
    let userConnection;
    try {
        userConnection = await request.server.plugins['app/ha-connect'].connect(userAuth);
        const clientName = `${env.CLIENT_NAME} (${uuid()})`;
        const accessToken = await userConnection.sendMessagePromise({
            type: 'auth/long_lived_access_token',
            client_name: clientName,
            lifespan: 365 * 10
        });
        const connection = await request.server.plugins['app/ha-connect'].globalConnection(accessToken);
        await request.server.plugins['app/storage'].set(`global-connection/client-name`, clientName);
        return h
            .response({ connected: connection.connected, client_name: clientName })
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
    const globalConnection = await request.server.plugins['app/ha-connect'].globalConnection();
    globalConnection?.close();
    await request.server.plugins['app/storage'].delete('global-connection');
    return h.response({ connected: false, client_name: undefined }).code(200);
}
async function getGlobalConnection(request, h) {
    const globalConnection = await request.server.plugins['app/ha-connect'].globalConnection();
    const clientName = await request.server.plugins['app/storage'].get(`global-connection/client-name`);
    return h
        .response({
        connected: globalConnection?.connected || false,
        client_name: clientName
    })
        .code(200);
}
async function createSocket(auth) {
    const { wsUrl } = auth;
    return new Promise((resolve, reject) => {
        let invalidAuth = false;
        let retries = 0;
        const connect = () => {
            const socket = new WebSocket(wsUrl, {
                rejectUnauthorized: true
            });
            const onCloseOrError = () => {
                if (invalidAuth) {
                    reject(ERR_INVALID_AUTH);
                    return;
                }
                setTimeout(() => connect(), 1000 + retries * retries * 1000);
            };
            const onOpen = async () => {
                try {
                    auth.expired && (await auth.refreshAccessToken());
                    socket.send(JSON.stringify({
                        type: 'auth',
                        access_token: auth.accessToken
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
        };
        return connect();
    });
}
export default haConnectPlugin;
//# sourceMappingURL=ha-connect.js.map