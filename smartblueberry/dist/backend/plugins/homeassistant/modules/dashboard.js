import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { env } from '../../../index.js';
const themes = [
    {
        filename: 'main',
        yamlJson: (server) => ({
            number: 3,
            plain: 'string',
            block: 'two\nlines\n',
            test: { t: 3 }
        })
    }
];
const themeBuilderPlugin = {
    name: 'themeBuilder',
    register: async (server, options) => {
        const updateThemeFiles = () => {
            for (const { yamlJson, filename } of themes) {
                const contents = yaml.stringify(yamlJson(server));
                fs.writeFileSync(path.resolve(process.cwd(), env.THEMES_DIR, filename), contents, 'utf8');
            }
        };
        server.expose({ update: updateThemeFiles });
    }
};
export default themeBuilderPlugin;
//# sourceMappingURL=dashboard.js.map