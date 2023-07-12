const healthcheckPlugin = {
    name: 'healthcheck',
    register: async (server) => {
        server.route({
            options: { auth: false },
            method: 'GET',
            path: '/healthcheck',
            handler: (_, h) => {
                return h.response({ up: true }).code(200);
            }
        });
    }
};
export default healthcheckPlugin;
//# sourceMappingURL=healthcheck.js.map