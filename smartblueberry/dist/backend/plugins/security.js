const securityPlugin = {
    name: 'security',
    dependencies: ['storage'],
    register: async (server) => {
        server.route({
            method: 'GET',
            path: '/api/security-lock-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/security-lock-closure-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/security-assault-alarm-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/security-smoke-trigger-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/security-assault-trigger-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'GET',
            path: '/api/security-assault-disarmer-items',
            handler: async (request, h) => {
            }
        });
    }
};
export default securityPlugin;
//# sourceMappingURL=security.js.map