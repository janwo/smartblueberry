import { Component, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

@Component({
  selector: 'app-select',
  templateUrl: './select.component.html',
  styleUrls: ['./select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ]
})
export class SelectComponent implements ControlValueAccessor {
  @Input() options: { [key: string]: string } = {}
  protected value: string | null = null
  disabled = false
  onChanged = (_: any) => {}
  onTouched = () => {}

  setValue(value: string | null) {
    this.value = value
    this.onChanged(this.value)
  }

  writeValue(value: string | null): void {
    this.setValue(value)
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  registerOnChange(fn: (_: any) => {}): void {
    this.onChanged = fn
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = this.disabled
  }
}
