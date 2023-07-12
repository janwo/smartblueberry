import * as hapi from '@hapi/hapi'
import humanInterval from 'human-interval'

declare module '@hapi/hapi' {
  interface PluginProperties {
    schedule: ReturnType<typeof ScheduleClient>
  }
}

const schedulePlugin: hapi.Plugin<null> = {
  name: 'schedule',
  register: async (server: hapi.Server) => {
    server.expose(ScheduleClient())
    server.ext({
      type: 'onPostStop',
      method: () => {
        server.plugins.schedule.stop()
      }
    })
  }
}

export default schedulePlugin

function ScheduleClient() {
  const schedules: Array<{
    interval?: NodeJS.Timer
    timeout?: NodeJS.Timeout
  }> = []

  return {
    stop: () =>
      schedules.map(({ timeout, interval }) => {
        if (timeout) {
          clearTimeout(timeout)
        }

        if (interval) {
          clearTimeout(interval)
        }
      }),
    addJob: (time: string, callback: () => void) => {
      const [match, isInterval, humanTime] =
        time.match(/^(every)?\s?(.*)$/) || []
      const millis = humanInterval(humanTime)
      if (millis === undefined) {
        throw new Error('Unkown interval format')
      }

      schedules.push(
        Object.fromEntries([
          isInterval
            ? ['interval', setInterval(callback, millis)]
            : ['timeout', setTimeout(callback, millis)]
        ])
      )
    }
  }
}
