import { Component, Input, OnInit } from '@angular/core'
import { HAService } from '../ha.service'
import { Observable, map, of } from 'rxjs'

@Component({
  selector: 'app-entity-schema',
  templateUrl: './entity-schema.component.html',
  styleUrls: ['./entity-schema.component.scss']
})
export class EntitySchemaComponent {
  @Input() domain?: string
  @Input() objectId?: string
  @Input() customPrefix?: string

  constructor(private haService: HAService) {}

  getPrefix(): Observable<string> {
    return this.customPrefix !== undefined
      ? of(this.customPrefix)
      : this.haService.getOptions().pipe(map((options) => `${options.prefix}_`))
  }
}
