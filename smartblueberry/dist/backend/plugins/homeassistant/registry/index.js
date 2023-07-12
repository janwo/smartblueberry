import { Registry } from './registry.js';
const haRegistryPlugin = {
    name: 'hassRegistry',
    dependencies: ['hassConnect'],
    register: async (server) => {
        server.app.hassRegistry = new Registry(server);
    }
};
export default haRegistryPlugin;
//# sourceMappingURL=index.js.map