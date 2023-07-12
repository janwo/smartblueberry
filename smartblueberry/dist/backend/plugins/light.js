import { HOMEASSISTANT_EVENT_TAGS } from './lib/hass-registry.js';
var ILLUMINANCE_CLASSIFCIATION;
(function (ILLUMINANCE_CLASSIFCIATION) {
    ILLUMINANCE_CLASSIFCIATION[ILLUMINANCE_CLASSIFCIATION["DARK"] = 3] = "DARK";
    ILLUMINANCE_CLASSIFCIATION[ILLUMINANCE_CLASSIFCIATION["DIMMED"] = 2] = "DIMMED";
    ILLUMINANCE_CLASSIFCIATION[ILLUMINANCE_CLASSIFCIATION["DAYLIGHT"] = 1] = "DAYLIGHT";
})(ILLUMINANCE_CLASSIFCIATION || (ILLUMINANCE_CLASSIFCIATION = {}));
const ILLUMINANCE_DEVICE = {
    deviceClass: 'illuminance',
    stateClass: 'measurement'
};
const MOTION_DEVICE = {
    deviceClass: 'motion',
    stateClass: 'measurement'
};
function illuminance(server) {
    console.log('start generation');
    const classify = (value) => {
        if (value > 0.7) {
            return ILLUMINANCE_CLASSIFCIATION.DAYLIGHT;
        }
        else if (value < 0.2) {
            return ILLUMINANCE_CLASSIFCIATION.DARK;
        }
        else {
            return ILLUMINANCE_CLASSIFCIATION.DIMMED;
        }
    };
    const illuminanceSensors = server.plugins.hassRegistry.getEntities(ILLUMINANCE_DEVICE);
    const values = Object.values(illuminanceSensors)
        .map(({ state }) => Math.min(1, Math.max(0, parseFloat(state) / 100)))
        .filter((value) => !Number.isNaN(value));
    const sun = server.plugins.hassRegistry.getEntity('sun.elevation');
    if (sun) {
        values.push(Math.max(0, Math.min(parseFloat(sun.state) + 40, 100)) / 100);
    }
    const sum = values.reduce((sum, value) => sum + value, 0);
    return {
        classification: classify(values.sort()[values.length / 2]),
        value: sum / values.length
    };
}
const lightPlugin = {
    name: 'light',
    dependencies: ['storage'],
    register: async (server) => {
        const cache = server.cache({
            segment: 'test',
            expiresIn: 5 * 1000
        });
        server.expose('illumination', async () => {
            let illumination = await cache.get('illumination');
            if (!illumination) {
                illumination = illuminance(server);
                cache.set('illumination', illumination);
            }
            return illumination;
        });
        setTimeout(async () => {
            console.log('tesft', await server.plugins.light.illumination());
        }, 2000);
        setTimeout(async () => {
            console.log('tesft', await server.plugins.light.illumination());
        }, 6000);
        setTimeout(async () => {
            console.log('tesft', await server.plugins.light.illumination());
        }, 10000);
        server.plugins.schedule.addJob('20 0 * * * *', () => {
            console.log(55);
        });
        server.plugins.hassRegistry.on([
            HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED,
            HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
        ], async (entity) => {
        });
    }
};
export default lightPlugin;
//# sourceMappingURL=light.js.map