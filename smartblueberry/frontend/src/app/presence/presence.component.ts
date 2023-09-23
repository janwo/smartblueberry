import { Component, OnInit } from '@angular/core'
import { FormData } from '../form/form.component'
import { HAService } from '../ha.service'
import { FormGroup, Validators } from '@angular/forms'
import { map } from 'rxjs'

interface PresenceTresholdsPayload {
  away: number
  abandoned: number
}

@Component({
  selector: 'app-presence',
  templateUrl: './presence.component.html',
  styleUrls: ['./presence.component.scss']
})
export class PresenceComponent implements OnInit {
  presenceTresholds: FormData<PresenceTresholdsPayload> | undefined

  constructor(private haService: HAService) {}

  ngOnInit(): void {
    this.haService
      .get<PresenceTresholdsPayload>('/presence-tresholds')
      .pipe(
        map((response) => {
          const { away, abandoned } = response.body!
          return {
            defaultValues: { away: away || 3, abandoned: abandoned || 24 },
            fields: {
              away: {
                label: $localize`Away`,
                type: 'number',
                typeOptions: { hint: $localize`Hours` },
                validators: [Validators.required, Validators.min(1)]
              },
              abandoned: {
                label: $localize`Abandoned`,
                type: 'number',
                typeOptions: { hint: $localize`Hours` },
                validators: [Validators.required, Validators.min(1)]
              }
            }
          } as FormData<PresenceTresholdsPayload>
        })
      )
      .subscribe({
        next: (presenceTresholds) => {
          this.presenceTresholds = presenceTresholds
        }
      })
  }

  updatePresenceThresholds(form: FormGroup) {
    const tresholds = {
      away: form.value.away,
      abandoned:form.value.abandoned
    }

    this.haService
      .post<PresenceTresholdsPayload>('/presence-tresholds', tresholds)
      .subscribe({
        next: (response) => {
          if (response.ok) {
            const { away, abandoned } = response.body!
            form.setValue({ away, abandoned })
          }
        }
      })
  }
}
