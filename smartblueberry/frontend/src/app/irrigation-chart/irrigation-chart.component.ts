import { Component, Input } from '@angular/core'
import * as dayjs from 'dayjs'

type IrrigationChartValues = {
  temperatureUnit: string
  precipitationUnit: string
  series: Series[]
}

type Series = {
  datetime: string
  precipitation: number
  temperature: { max: number; min: number }
  evaporation: number
  irrigation: number
}

@Component({
  selector: 'app-irrigation-chart',
  templateUrl: './irrigation-chart.component.html',
  styleUrls: ['./irrigation-chart.component.scss']
})
export class IrrigationChartComponent {
  @Input() values?: IrrigationChartValues

  data() {
    const now = dayjs()
    const { series } = this.values || {
      series: [] as Series[]
    }

    return {
      labels: series.map((d) =>
        dayjs(d.datetime).toDate().toLocaleDateString()
      ),
      datasets: [
        {
          label: $localize`Maximal Temperature`,
          type: 'line',
          yAxisID: 'temperature',
          tension: 0.25,
          borderColor: 'rgba(255, 130, 169, 1)',
          backgroundColor: 'rgba(0,0,0,0)',
          pointBackgroundColor: 'rgba(255, 130, 169, .5)',
          data: series.map((s) => s.temperature.max)
        },
        {
          label: $localize`Minimal Temperature`,
          type: 'line',
          yAxisID: 'temperature',
          tension: 0.25,
          borderColor: 'rgba(90, 118, 196, 1)',
          backgroundColor: 'rgba(0,0,0,0)',
          pointBackgroundColor: 'rgba(90, 118, 196, .5)',
          data: series.map((s) => s.temperature.min)
        },
        {
          label: $localize`Irrigation Indicator`,
          type: 'line',
          borderColor: 'rgba(0, 0, 0, 1)',
          backgroundColor: 'rgba(0,0,0,0)',
          pointBackgroundColor: 'rgba(0, 0, 0, .5)',
          yAxisID: 'amount',
          tension: 0.25,
          data: series.reduce(
            (data: number[], s) => [
              ...data,
              (data[data.length - 1] || 0) +
                s.precipitation +
                (s.irrigation || 0) -
                s.evaporation
            ],
            []
          )
        },
        {
          label: $localize`Rain`,
          type: 'bar',
          yAxisID: 'amount',
          stack: 'watering',
          data: series.map((s) => s.precipitation || 0),
          borderColor: 'rgba(90, 118, 196, 1)',
          backgroundColor: series.map((s) =>
            dayjs(s.datetime).isAfter(now)
              ? 'rgba(90, 118, 196, .25)'
              : 'rgba(90, 118, 196, .5)'
          )
        },
        {
          label: $localize`Irrigation`,
          type: 'bar',
          yAxisID: 'amount',
          stack: 'watering',
          borderColor: 'rgba(14, 173, 105, 1)',
          backgroundColor: 'rgba(14, 173, 105, .5)',
          data: series.map((s) => s.irrigation || 0)
        },
        {
          label: $localize`Evaporation`,
          type: 'bar',
          yAxisID: 'amount',
          stack: 'watering',
          data: series.map((s) => -s.evaporation),
          fill: true,
          borderColor: 'rgba(255, 235, 231, 1)',
          backgroundColor: series.map((s) =>
            dayjs(s.datetime).isAfter(now)
              ? 'rgba(202, 137, 95, .25)'
              : 'rgba(202, 137, 95, .5)'
          )
        }
      ]
    }
  }
}
