import { parseCronExpression } from 'cron-schedule';
import { IntervalBasedCronScheduler } from 'cron-schedule/schedulers/interval-based.js';
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
    const scheduler = new IntervalBasedCronScheduler(60 * 1000);
    return {
        stop: () => scheduler.stop(),
        addJob: (cronTime, callback) => {
            const cron = parseCronExpression(cronTime);
            scheduler.registerTask(cron, callback);
        }
    };
}
//# sourceMappingURL=schedule.js.map