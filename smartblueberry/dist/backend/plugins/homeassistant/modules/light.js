import { HOMEASSISTANT_EVENT_TAGS } from '../registry/registry.js';
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
    const classify = (value) => {
        if (value < 0.2) {
            return ILLUMINANCE_CLASSIFCIATION.DARK;
        }
        else if (value < 0.7) {
            return ILLUMINANCE_CLASSIFCIATION.DIMMED;
        }
        else {
            return ILLUMINANCE_CLASSIFCIATION.DAYLIGHT;
        }
    };
    const illuminanceSensors = server.app.hassRegistry.getEntities(ILLUMINANCE_DEVICE);
    const values = Object.values(illuminanceSensors)
        .map(({ state }) => Math.min(1, Math.max(0, parseFloat(state) / 100)))
        .filter((value) => !Number.isNaN(value));
    const sun = server.app.hassRegistry.getEntity('sun.elevation');
    if (sun) {
        values.push(Math.max(0, Math.min(parseFloat(sun.state) + 40, 100)) / 100);
    }
    return classify(values.sort()[values.length / 2]);
}
const lightPlugin = {
    name: 'light',
    dependencies: ['storage'],
    register: async (server) => {
        server.plugins.schedule.addJob('every minute', async () => {
            const result = await server.plugins.hassConnect.rest.post('/states/input_select.light_state', {
                state: '1'
            });
            console.log(result);
        });
        server.app.hassRegistry.on([
            HOMEASSISTANT_EVENT_TAGS.STATE_CHANGED,
            HOMEASSISTANT_EVENT_TAGS.REGISTRY_UPDATED
        ], async (entity) => {
        });
    }
};
export default lightPlugin;
//# sourceMappingURL=light.js.map