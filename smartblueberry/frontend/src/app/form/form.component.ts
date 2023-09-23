import { KeyValue } from '@angular/common'
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core'
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms'

export type FormField = {
  validators?: ValidatorFn[]
} & (
  | ({
      label: string
    } & (
      | { type: 'select'; typeOptions: { options: { [key: string]: string } } }
      | { type: 'checkbox' }
      | {
          type: 'number'
          typeOptions?: {
            placeholder?: string
            min?: number
            max?: number
            step?: number
            hint?: string
          }
        }
      | {
          type: 'text'
          typeOptions?: {
            hint: string
            placeholder?: string
          }
        }
    ))
  | {
      type: 'hidden'
    }
)

export interface FormValue {
  [key: string]: any
}

export interface FormData<V extends FormValue> {
  defaultValues: V
  fields: { [key in keyof V]: FormField }
}

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss']
})
export class FormComponent<FormValue extends { [key: string]: any }>
  implements OnChanges
{
  @Input() formData?: FormData<FormValue>
  @Output() onSubmit: EventEmitter<FormGroup> = new EventEmitter()
  formGroup?: FormGroup

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formData']) {
      this.formGroup = new FormGroup(
        Object.fromEntries(
          Object.entries(this.formData?.fields || {}).map(([name, field]) => {
            return [name, new FormControl('', field.validators)]
          })
        )
      )

      if (this.formData?.defaultValues) {
        this.formGroup.setValue(this.formData.defaultValues)
      }
    }
  }

  submit() {
    if (this.formGroup) {
      this.formGroup.markAllAsTouched()
      this.onSubmit.emit(this.formGroup)
    }
  }

  public value() {
    return this.formGroup?.value
  }

  protected compare(
    a: KeyValue<string, FormField>,
    b: KeyValue<string, FormField>
  ) {
    return 0
  }
}
