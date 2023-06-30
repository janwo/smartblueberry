import { Config, JsonDB } from 'node-json-db';
import path from 'path';
import { env } from '../../index.js';
const storagePlugin = {
    name: 'storage',
    register: async (server, options) => {
        const filePath = path.resolve(env.CONFIG_DIR, './json-storage.json');
        const db = new JsonDB(new Config(filePath, true, env.BUILD != 'production', '/'));
        if (env.BUILD !== 'production') {
            console.log(`Storage saved to "${filePath}"`);
        }
        const dbHelper = (() => {
            const createPath = (path) => '/' + path.split('/').join('/');
            return {
                get: async (path) => {
                    const fullPath = createPath(path);
                    return (await db.exists(fullPath)) ? db.getData(fullPath) : undefined;
                },
                delete: async (path) => {
                    const fullPath = createPath(path);
                    if (await db.exists(fullPath)) {
                        return db.delete(fullPath);
                    }
                },
                set: async (path, obj) => {
                    const fullPath = createPath(path);
                    return db.push(fullPath, obj, true);
                }
            };
        })();
        server.expose('get', dbHelper.get);
        server.expose('set', dbHelper.set);
        server.expose('delete', dbHelper.delete);
    }
};
export default storagePlugin;
//# sourceMappingURL=storage.js.map