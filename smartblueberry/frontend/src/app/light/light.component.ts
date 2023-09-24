import { Component, OnInit } from '@angular/core'
import { FormGroup, Validators } from '@angular/forms'
import { Observable, map, of } from 'rxjs'
import { FormData, FormValue } from '../form/form.component'
import { HAService } from '../ha.service'

type activationBehavior = 'on' | 'off' | 'auto-on' | 'simulate' | 'unchanged'

interface LightModePayload {
  id?: string
  name: string
  darkCondition: activationBehavior
  brightCondition: activationBehavior
  obscuredCondition: activationBehavior
  brightness: number
  duration?: number
}

interface LightTresholdsPayload {
  bright: number
  obscured: number
}

@Component({
  selector: 'app-light',
  templateUrl: './light.component.html',
  styleUrls: ['./light.component.scss']
})
export class LightComponent implements OnInit {
  lightTresholds: FormData<LightTresholdsPayload> | undefined
  lightModes: FormData<LightModePayload>[] = []
  visibleAccordion: string | false | undefined = false

  constructor(private haService: HAService) {}

  ngOnInit(): void {
    // Load light modes
    this.haService
      .get<LightModePayload[]>('/light-modes')
      .pipe(
        map((response) => {
          const lightModesPayload = response.body || []
          return lightModesPayload.map(this.createLightMode)
        })
      )
      .subscribe({
        next: (lightModes) => {
          this.lightModes = lightModes
        }
      })

    // Load tresholds
    this.haService
      .get<LightTresholdsPayload>('/light-tresholds')
      .pipe(
        map((response) => {
          const { obscured, bright } = response.body!
          return {
            defaultValues: { obscured: obscured * 100, bright: bright * 100 },
            fields: {
              obscured: {
                label: $localize`Obscured`,
                type: 'number',
                typeOptions: { hint: $localize`%` },
                validators: [
                  Validators.required,
                  Validators.min(1),
                  Validators.max(100)
                ]
              },
              bright: {
                label: $localize`Bright`,
                type: 'number',
                typeOptions: { hint: $localize`%` },
                validators: [
                  Validators.required,
                  Validators.min(1),
                  Validators.max(100)
                ]
              }
            }
          } as FormData<LightTresholdsPayload>
        })
      )
      .subscribe({
        next: (lightTresholds) => {
          this.lightTresholds = lightTresholds
        }
      })
  }

  private createLightMode(lightModePayload?: LightModePayload) {
    const conditionTitles = {
      brightCondition: $localize`Bright`,
      obscuredCondition: $localize`Obscured`,
      darkCondition: $localize`Dark`
    }

    return {
      defaultValues: {
        id: lightModePayload?.id || null,
        name: lightModePayload?.name || $localize`New Light Mode`,
        ...Object.fromEntries(
          Object.keys(conditionTitles).map((attribute) => {
            const value =
              lightModePayload?.[attribute as keyof LightModePayload] ||
              'unchanged'
            return [attribute, value]
          })
        ),
        duration: lightModePayload?.duration || 15,
        brightness: (lightModePayload?.brightness || 1) * 100
      },
      fields: {
        id: { type: 'hidden' },
        name: {
          label: $localize`Name`,
          type: 'text',
          validators: [Validators.required]
        },
        ...Object.fromEntries(
          Object.entries(conditionTitles).map(([attribute, label]) => [
            attribute,
            {
              label,
              type: 'select',
              typeOptions: {
                options: {
                  on: $localize`On`,
                  off: $localize`Off`,
                  'auto-on': $localize`Auto-On`,
                  unchanged: $localize`Unchanged`,
                  simulate: $localize`Simulate`
                }
              },
              validators: [Validators.required]
            }
          ])
        ),
        brightness: {
          label: $localize`Light Brightness`,
          type: 'number',
          typeOptions: { hint: $localize`%` },
          validators: [Validators.min(1), Validators.max(100)]
        },
        duration: {
          label: $localize`Light Duration`,
          type: 'number',
          typeOptions: { hint: $localize`Minutes` },
          validators: [Validators.required, Validators.min(1)]
        }
      }
    } as FormData<LightModePayload>
  }

  protected addLightMode() {
    this.visibleAccordion = undefined
    this.lightModes.push(this.createLightMode())
  }

  upsertLightMode = (
    formData: FormData<LightModePayload>,
    formGroup: FormGroup
  ) => {
    const lightMode = {
      id: this.convertNullToUndefined(formGroup.value.id),
      name: this.convertNullToUndefined(formGroup.value.name),
      darkCondition: formGroup.value.darkCondition,
      brightCondition: formGroup.value.brightCondition,
      obscuredCondition: formGroup.value.obscuredCondition,
      brightness:
        (this.convertNullToUndefined(formGroup.value.brightness) || 100) / 100,
      duration: this.convertNullToUndefined(formGroup.value.duration)
    }

    this.haService.post<LightModePayload>('/light-modes', lightMode).subscribe({
      next: (response) => {
        if (response.ok) {
          formData.defaultValues.name = response.body!.name
          formGroup.setValue({
            ...response.body,
            brightness: (response.body?.brightness || 1) * 100
          })
        }
      }
    })
  }

  deleteLightMode(id: string | undefined) {
    const remove = () => {
      this.lightModes = this.lightModes.filter(
        (lightMode) => lightMode.defaultValues.id !== id
      )
    }

    if (id === undefined) {
      return remove()
    }

    this.haService.delete('/light-modes', { id }).subscribe({
      next: (response) => response.ok && remove()
    })
  }

  updateLightTresholds(form: FormGroup) {
    const tresholds = {
      obscured: form.controls['obscured'].value / 100,
      bright: form.controls['bright'].value / 100
    }

    this.haService
      .post<LightTresholdsPayload>('/light-tresholds', tresholds)
      .subscribe({
        next: (response) => {
          if (response.ok) {
            const { obscured, bright } = response.body!
            form.setValue({
              obscured: obscured * 100,
              bright: bright * 100
            })
          }
        }
      })
  }

  protected openAccordion(formData: FormData<LightModePayload>): void {
    this.visibleAccordion = formData.defaultValues.id
  }

  protected closeAccordion(): void {
    this.visibleAccordion = false
  }

  convertNullToUndefined(value: any) {
    return value === null ? undefined : value
  }

  getValue(formData: FormValue, name: keyof FormValue) {
    return (formData['initialize']?.pipe(
      map((value: FormValue) => value[name])
    ) || of(null)) as Observable<FormValue[typeof name]>
  }
}
