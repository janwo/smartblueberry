import { Component, OnInit } from '@angular/core'
import { forkJoin } from 'rxjs'
import { HAService, Item, GetItemListResponse } from '../ha.service'

@Component({
  selector: 'app-security',
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss']
})
export class SecurityComponent implements OnInit {
  constructor(private haService: HAService) {}

  schema = {
    assaultTriggerItems: {
      tags: ['Window', 'Door', 'CoreAssaultTrigger'],
      description: $localize`Assault trigger items`,
      childs: [{ tags: ['OpenState', 'Switch'] }]
    },
    smokeTriggerItems: {
      tags: ['SmokeDetector'],
      description: $localize`Smoke trigger items`,
      childs: [{ tags: ['Alarm'] }]
    },
    assaultDisarmerItems: {
      description: $localize`Assault Disarmer Items`,
      tags: ['CoreAssaultDisarmer'],
      childs: [
        {
          tags: ['OpenState', 'Switch']
        }
      ]
    },
    lockClosureItems: {
      tags: ['CoreLockClosure'],
      description: $localize`Lock closure items`,
      childs: [
        {
          tags: ['OpenState', 'Switch']
        }
      ]
    },
    lockItems: {
      tags: ['Lock'],
      description: $localize`Lock items`,
      childs: [
        {
          tags: ['OpenState', 'Switch']
        }
      ]
    },
    assaultAlarmItems: {
      tags: ['AlarmSystem', 'Siren'],
      description: $localize`Assault Alarm items`,
      childs: [{ tags: ['Alarm'] }]
    }
  }

  assaultTriggerItems: Item[] = []
  assaultDisarmerItems: Item[] = []
  lockClosureItems: Item[] = []
  lockItems: Item[] = []
  assaultAlarmItems: Item[] = []
  smokeTriggerItems: Item[] = []

  ngOnInit(): void {
    forkJoin([
      this.haService.security.assaultTriggerItems(),
      this.haService.security.assaultDisarmerItems(),
      this.haService.security.lockItems(),
      this.haService.security.lockClosureItems(),
      this.haService.security.assaultAlarmItems(),
      this.haService.security.smokeTriggerItems()
    ]).subscribe({
      next: (response) => {
        this.assaultTriggerItems = response[0].body!.data
        this.assaultDisarmerItems = response[1].body!.data
        this.lockItems = response[2].body!.data
        this.lockClosureItems = response[3].body!.data
        this.assaultAlarmItems = response[4].body!.data
        this.smokeTriggerItems = response[5].body!.data
      }
    })
  }
}
