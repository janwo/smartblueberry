import { Component, OnInit } from '@angular/core'
import { FormBuilder, FormGroup } from '@angular/forms'
import { forkJoin } from 'rxjs'
import { Item, HAService } from '../ha.service'

@Component({
  selector: 'app-climate',
  templateUrl: './doors-windows.component.html',
  styleUrls: ['./doors-windows.component.scss']
})
export class DoorsWindowsComponent implements OnInit {
  constructor(public haService: HAService, private formBuilder: FormBuilder) {}

  heatingItems: { item: Item; form: FormGroup }[] = []
  heatingContactSwitchableItems: Item[] = []

  ngOnInit(): void {
    /*
    forkJoin([
      this.haService.climate.modeItems(),
      this.haService.climate.contactSwitchableItems()
    ]).subscribe({
      next: (response) => {
        this.heatingContactSwitchableItems = response[1].body!.data
        this.heatingItems = response[0].body!.data.map((item) => {
          return {
            item,
            form: this.formBuilder.group({
              off: [
                item.jsonStorage?.['commandMap']?.off !== undefined
                  ? item.jsonStorage['commandMap'].off
                  : null
              ],
              on: [
                item.jsonStorage?.['commandMap']?.on !== undefined
                  ? item.jsonStorage['commandMap'].on
                  : null
              ],
              eco: [
                item.jsonStorage?.['commandMap']?.eco !== undefined
                  ? item.jsonStorage['commandMap'].eco
                  : null
              ],
              power: [
                item.jsonStorage?.['commandMap']?.power !== undefined
                  ? item.jsonStorage['commandMap'].power
                  : null
              ]
            })
          }
        })
      }
    })*/
  }

  countValues(form: FormGroup) {
    return Object.values(form.value).filter((value) => value !== null).length
  }

  updateItem(item: { item: Item; form: FormGroup }) {
    /*
    item.form.markAllAsTouched()
    const commandMap = item.form.value
    let deleteCommandMap = Object.values(commandMap).every(
      (value: any) => value?.length == 0
    )

    for (const control in item.form.controls) {
      if (deleteCommandMap) {
        item.form.controls[control].setErrors(null)
        continue
      }

      if (item.form.controls[control].value == null) {
        item.form.controls[control].setErrors({ required: true })
        item.form.setErrors({ required: true })
      }
    }

    if (item.form.invalid) {
      return
    }

    const observable = deleteCommandMap
      ? this.haService.climate.deleteCommandMap(item.item.name)
      : this.haService.climate.updateCommandMap(item.item.name, commandMap)
    observable.subscribe({
      next: ({ body }) => {
        if (!body?.success) {
          item.form.setErrors({
            invalid: true
          })
          return
        }
      },
      error: (response) => {
        item.form.setErrors({
          connection: true
        })
      }
    })*/
  }
}
