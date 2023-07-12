import humanInterval from 'human-interval';
const schedulePlugin = {
    name: 'schedule',
    register: async (server) => {
        server.expose(ScheduleClient());
        server.ext({
            type: 'onPostStop',
            method: () => {
                server.plugins.schedule.stop();
            }
        });
    }
};
export default schedulePlugin;
function ScheduleClient() {
    const schedules = [];
    return {
        stop: () => schedules.map(({ timeout, interval }) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (interval) {
                clearTimeout(interval);
            }
        }),
        addJob: (time, callback) => {
            const [match, isInterval, humanTime] = time.match(/^(every)?\s?(.*)$/) || [];
            const millis = humanInterval(humanTime);
            if (millis === undefined) {
                throw new Error('Unkown interval format');
            }
            schedules.push(Object.fromEntries([
                isInterval
                    ? ['interval', setInterval(callback, millis)]
                    : ['timeout', setTimeout(callback, millis)]
            ]));
        }
    };
}
//# sourceMappingURL=schedule.js.map