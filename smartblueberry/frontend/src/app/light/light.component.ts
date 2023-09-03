import { Component, OnInit } from '@angular/core'
import {
  FormControl,
  FormGroup,
  Validators
} from '@angular/forms'
import { forkJoin } from 'rxjs'
import { HAService } from '../ha.service'

type activationBehavior = 'on' | 'off' | 'auto-on' | 'simulate' | 'unchanged'

interface LightMode {
  id: string | null
  name: string
  darkCondition: activationBehavior
  brightCondition: activationBehavior
  obscuredCondition: activationBehavior
  options: {
    brightness?: number
    duration?: number
  }
}

@Component({
  selector: 'app-light',
  templateUrl: './light.component.html',
  styleUrls: ['./light.component.scss']
})
export class LightComponent implements OnInit {
  CONDITION_OPTIONS = {
    on: 'On',
    off: 'Off',
    'auto-on': 'Auto-On',
    unchanged: 'Unverändert',
    simulate: 'Simulieren'
  }
  lightModeForms

  constructor(private haService: HAService) {
    this.lightModeForms = [] as ReturnType<
      typeof LightComponent.generateLightModeForm
    >[]
  }

  private static generateLightModeForm({
    id,
    name,
    darkCondition,
    brightCondition,
    obscuredCondition,
    options
  }: Partial<LightMode> = {}) {
    return new FormGroup({
      id: new FormControl(id === undefined ? null : id),
      name: new FormControl(name || '', [Validators.required]),
      darkCondition: new FormControl(darkCondition || null, [
        Validators.required
      ]),
      brightCondition: new FormControl(brightCondition || null, [
        Validators.required
      ]),
      obscuredCondition: new FormControl(obscuredCondition || null, [
        Validators.required
      ]),
      options: new FormGroup({
        brightness: new FormControl(
          options?.brightness === undefined ? null : options.brightness,
          [Validators.min(0), Validators.max(100)]
        ),
        duration: new FormControl(
          options?.duration === undefined ? null : options.duration,
          [Validators.min(0), Validators.max(100)]
        )
      })
    })
  }

  protected hasLightModeConditions(
    form: ReturnType<typeof LightComponent.generateLightModeForm>,
    value: keyof typeof this.CONDITION_OPTIONS
  ) {
    const { darkCondition, brightCondition, obscuredCondition } = form.controls
    return [
      darkCondition.value,
      brightCondition.value,
      obscuredCondition,
      value
    ].some((v) => value)
  }

  protected hasUnsetIds(forms: FormGroup<{ id: string } & any>[]) {
    return forms.some((form) => form.controls['id'].value === null)
  }

  convertNullToUndefined(value: any) {
    return value === null ? undefined : value
  }

  addLightMode() {
    this.lightModeForms.push(LightComponent.generateLightModeForm())
  }

  submitLightMode(
    form: ReturnType<typeof LightComponent.generateLightModeForm>
  ) {
    if (!form.valid) {
      form.setErrors({ missing: 'df' })
      return
    }

    const lightMode = {
      id: this.convertNullToUndefined(form.controls.id.value),
      name: this.convertNullToUndefined(form.controls.name.value),
      darkCondition: form.controls.darkCondition.value,
      brightCondition: form.controls.brightCondition.value,
      obscuredCondition: form.controls.obscuredCondition.value
    }

    const options = {
      brightness: this.convertNullToUndefined(
        form.controls.options.controls.brightness.value
      ),
      duration: this.hasLightModeConditions(form, 'auto-on')
        ? this.convertNullToUndefined(
            form.controls.options.controls.duration.value
          )
        : undefined
    }

    return this.haService
      .post<LightMode>('/light-modes', { ...lightMode, options })
      .subscribe({
        next: (response) => {
          if (response.ok) {
            //this.lightModeForms.filter(lightModeForm => lightModeForm.controls.id.value !== null).push(
            //  LightComponent.generateLightModeForm(response.body!.data)
            // )
            form.controls.id.setValue(response.body?.data.id || null)
          }
        }
      })
  }

  deleteLightMode(
    form: ReturnType<typeof LightComponent.generateLightModeForm>
  ) {
    if (form.controls.id.value !== null) {
      this.haService
        .delete('/light-modes', { id: form.controls.id.value })
        .subscribe({
          next: (response) => {
            if (response.ok) {
              this.lightModeForms = this.lightModeForms.filter(
                (lightModeForm) =>
                  lightModeForm.controls.id.value !== form.controls.id.value
              )
            }
          }
        })
      return
    }

    this.lightModeForms = this.lightModeForms.filter(
      (lightModeForm) => lightModeForm.controls.id.value !== null
    )
  }

  ngOnInit(): void {
    forkJoin([this.haService.get<LightMode[]>(`/light-modes`)]).subscribe({
      next: (response) => {
        const { data } = response[0].body!
        this.lightModeForms = data.map(LightComponent.generateLightModeForm)
      }
    })
  }
}
