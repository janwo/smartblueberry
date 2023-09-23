import { Component } from '@angular/core'
import { FormGroup, Validators } from '@angular/forms'
import { HAService } from '../ha.service'
import { FormData } from '../form/form.component'
import { map } from 'rxjs'

interface IrrigationFeaturesPayload {
  checkOnForecastUpdates: boolean
}

interface IrrigationValvePayload {
  entityId: string
  entityName: string
  params: {
    irrigationVolumePerMinute: string
    minimalTemperature: string
    observedDays: number
    overshootDays: number
    evaporationFactor: number
  }
  amounts: {
    pastHydro: number
    futureHydro: number
    pastIrrigation: number
    futureIrrigation: number
  }
  series: {
    datetime: string
    precipitation: number
    temperature: {
      max: number
      min: number
    }
    evaporation: number
    irrigation: number
  }[]
}

export type IrrigationValveFormValue = IrrigationValvePayload['params'] & {
  entityId: IrrigationValvePayload['entityId']
}

@Component({
  selector: 'app-irrigation',
  templateUrl: './irrigation.component.html',
  styleUrls: ['./irrigation.component.scss']
})
export class IrrigationComponent {
  irrgationFeatures: IrrigationFeaturesPayload | undefined
  irrigationValves: (IrrigationValvePayload & {
    formData: FormData<IrrigationValveFormValue>
  })[] = []
  i18nPluralMapping = {
    '=0': $localize`0 days`,
    '=1': $localize`1 day`,
    other: $localize`# days`
  }

  constructor(public haService: HAService) {}

  ngOnInit(): void {
    this.haService
      .get<IrrigationFeaturesPayload>('/irrigation-features')
      .subscribe({
        next: (response) => {
          this.irrgationFeatures = response.body!
        }
      })

    this.haService
      .get<IrrigationValvePayload[]>('/irrigation-valves')
      .pipe(
        map((response) => {
          return response.body!.map((valve) => ({
            ...valve,
            formData: this.mapValve({
              entityId: valve.entityId,
              ...valve.params
            })
          }))
        })
      )
      .subscribe({
        next: (irrigationValves) => {
          this.irrigationValves = irrigationValves
        }
      })
  }

  setFeature(feature: keyof IrrigationFeaturesPayload, state: boolean): void {
    const modifiedFeatures = { ...this.irrgationFeatures, [feature]: state }

    this.haService
      .post<IrrigationFeaturesPayload>('/irrigation-features', modifiedFeatures)
      .subscribe({
        next: (response) => {
          if (response.ok) {
            this.irrgationFeatures = modifiedFeatures
          }
        }
      })
  }

  private mapValve(valvePayload: IrrigationValveFormValue) {
    const {
      entityId,
      irrigationVolumePerMinute,
      minimalTemperature,
      observedDays,
      overshootDays,
      evaporationFactor
    } = valvePayload

    return {
      defaultValues: {
        entityId,
        irrigationVolumePerMinute,
        minimalTemperature,
        observedDays,
        overshootDays,
        evaporationFactor
      },
      fields: {
        entityId: { type: 'hidden' },
        evaporationFactor: {
          label: $localize`Evaporation Factor`,
          type: 'number',
          typeOptions: { min: 0, step: 0.1 }
        },
        irrigationVolumePerMinute: {
          validators: [
            Validators.required,
            Validators.pattern(/^(\d+(\.\d+)?)\s?(mm|in)$/i)
          ],
          label: $localize`Irrigation Level Per Minute`,
          type: 'text',
          typeOptions: {
            placeholder: $localize`mm / in`,
            hint: $localize`per minute`
          }
        },
        minimalTemperature: {
          validators: [
            Validators.required,
            Validators.pattern(/^(\d+(\.\d+)?)\s?(C|F)$/i)
          ],
          label: $localize`Minimal Temperature`,
          type: 'text',
          typeOptions: {
            placeholder: $localize`C / F`,
            hint: $localize`per minute`
          }
        },
        observedDays: {
          label: $localize`Bucket Size`,
          type: 'select',
          typeOptions: {
            options: {
              1: $localize`1 day`,
              ...Object.fromEntries(
                [2, 3, 4, 5, 6].map((value) => [
                  value,
                  $localize`${value} days`
                ])
              )
            }
          }
        },
        overshootDays: {
          label: $localize`Extend Bucket upon Future Rainfalls`,
          type: 'select',
          typeOptions: {
            options: {
              1: $localize`1 day`,
              ...Object.fromEntries(
                [2, 3, 4, 5, 6].map((value) => [
                  value,
                  $localize`${value} days`
                ])
              )
            }
          }
        }
      }
    } as FormData<IrrigationValveFormValue>
  }

  updateIrrigationValve(form: FormGroup) {
    const irrigationValve = {
      entityId: form.value.entityId,
      params: {
        irrigationVolumePerMinute: form.value.irrigationVolumePerMinute,
        minimalTemperature: form.value.minimalTemperature,
        observedDays: form.value.observedDays,
        overshootDays: form.value.overshootDays,
        evaporationFactor: form.value.evaporationFactor
      }
    }

    this.haService
      .post<IrrigationValvePayload>('/irrigation-valves', irrigationValve)
      .subscribe({
        next: (response) => {
          if (response.ok) {
            const { params, entityId } = response.body!
            form.setValue({ entityId, ...params })
          }
        }
      })
  }

  calculatedMinutes(formValue: IrrigationValveFormValue) {
    const [, irrigationVolumePerMinute] =
      formValue.irrigationVolumePerMinute.match(/^(\d+\.?\d*)\s*(?:in|mm)$/) ||
      []

    return (
      Math.round(
        ((formValue.evaporationFactor * formValue.observedDays) /
          Number.parseFloat(irrigationVolumePerMinute)) *
          10
      ) / 10
    )
  }

  irrigationChartValues(
    series: IrrigationValvePayload['series'],
    formValue: {
      minimalTemperature: string
      irrigationVolumePerMinute: string
    }
  ) {
    const extractUnit = (text: string) =>
      text.match(/^\d+\.?\d*\s*°?(.*)$/) || []
    const [, temperatureUnit] = extractUnit(formValue.minimalTemperature)
    const [, precipitationUnit] = extractUnit(
      formValue.irrigationVolumePerMinute
    )

    // Convert mm/day and K to desired units
    return {
      series: series.map((s) => {
        if (precipitationUnit == 'in') {
          s = {
            ...s,
            evaporation: s.evaporation * 25.4,
            irrigation: s.irrigation * 25.4,
            precipitation: s.precipitation * 25.4
          }
        }

        if (temperatureUnit == 'F') {
          const toFahrenheit = (K: number) => ((K - 273.15) * 9) / 5 + 32
          s = {
            ...s,
            temperature: {
              max: toFahrenheit(s.temperature.max),
              min: toFahrenheit(s.temperature.min)
            }
          }
        }

        if (temperatureUnit == 'C') {
          const toCelsius = (K: number) => K - 273.15
          s = {
            ...s,
            temperature: {
              max: toCelsius(s.temperature.max),
              min: toCelsius(s.temperature.min)
            }
          }
        }

        return s
      }),
      temperatureUnit,
      precipitationUnit
    }
  }
}
