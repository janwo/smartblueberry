import WebSocket from 'ws';
const DEBUG = false;
const createHassWS = (ws, debug = false) => {
    const waitingMessages = {};
    ws.on('message', (data) => {
        const { id, ...message } = JSON.parse(data.toString());
        debug && console.log('received: %s', data, id, message);
        if (waitingMessages[id]) {
            waitingMessages[id](message);
        }
    });
    return {
        message: (message, updates) => {
            return new Promise((resolve, reject) => {
                const messageId = Object.keys(waitingMessages).length + 1;
                waitingMessages[messageId] = (message) => {
                    if (updates) {
                        updates(message);
                    }
                    else {
                        delete waitingMessages[messageId];
                    }
                    resolve(message);
                };
                const messageString = JSON.stringify({ ...message, id: messageId });
                debug && console.log('send: %s', messageString);
                ws.send(messageString, (error) => {
                    if (error) {
                        return reject(error);
                    }
                });
            });
        },
        ws
    };
};
const connect = (url) => {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on('error', reject);
        ws.on('message', (message) => {
            const { type } = JSON.parse(message.toString());
            switch (type) {
                case 'auth_ok':
                    return resolve(createHassWS(ws, DEBUG));
                case 'auth_required':
                    ws.send(JSON.stringify({
                        type: 'auth',
                        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxNzM2OTYyZDQ0Y2U0M2MzOTU3Mjg0MzU0ODhhZTZhOSIsImlhdCI6MTY4NjMwNjY2MiwiZXhwIjoyMDAxNjY2NjYyfQ.RmxrvK21ISSEpsYJme1Nv0-7-cc8X4vY5sbbC7I8j-w'
                    }));
                    break;
                default:
                    return reject(type);
            }
        });
    });
};
(async () => {
    try {
        const connection = await connect('ws://localhost:8123/api/websocket');
        const subscribe = [
            {
                type: 'subscribe_events',
                event_type: 'state_changed'
            },
            {
                type: 'get_config'
            }
        ];
        let [{ result: entities }, { result: devices }, { result: areas }] = await Promise.all([
            connection.message({
                id: 11,
                type: 'auth/long_lived_access_token',
                client_name: 'GPS Logger',
                client_icon: null,
                lifespan: 365
            }),
            connection.message({
                type: 'config/entity_registry/list'
            }),
            ,
            connection.message({
                type: 'config/device_registry/list'
            }),
            connection.message({
                type: 'config/area_registry/list'
            })
        ]);
        areas = Object.fromEntries(areas.map(({ area_id, name }) => [area_id, { name }]));
        devices = Object.fromEntries(devices.map(({ id, area_id, name }) => [
            id,
            { name, area: areas[area_id] }
        ]));
        entities = Object.fromEntries(entities.map(({ entity_id, device_id }) => [
            entity_id,
            { device: devices[device_id] }
        ]));
        console.log(entities);
    }
    catch (err) {
        console.error(err);
    }
})();
//# sourceMappingURL=index.js.map