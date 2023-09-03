import { Component, Input } from '@angular/core'
import { HAService } from '../ha.service'

@Component({
  selector: 'app-entity-schema',
  templateUrl: './entity-schema.component.html',
  styleUrls: ['./entity-schema.component.scss']
})
export class EntitySchemaComponent {
  @Input() domain?: string
  @Input() objectId?: string
  prefix?: string

  constructor(private haService: HAService) {
    this.haService.get<any>('/options').subscribe({
      next: (response) => {
        this.prefix = response.body?.data.entityPrefix
      }
    })
  }
}
