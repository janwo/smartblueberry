import { Component, OnInit } from '@angular/core'
import { HAService } from '../ha.service'

interface DoorsWindowsFeaturesPayload {
  climate: boolean
}

@Component({
  selector: 'app-climate',
  templateUrl: './doors-windows.component.html',
  styleUrls: ['./doors-windows.component.scss']
})
export class DoorsWindowsComponent implements OnInit {
  doorsWindowsFeatures: DoorsWindowsFeaturesPayload | undefined

  constructor(public haService: HAService) {}

  ngOnInit(): void {
    this.haService
      .get<DoorsWindowsFeaturesPayload>('/doors-windows-features')
      .subscribe({
        next: (response) => {
          this.doorsWindowsFeatures = response.body!
        }
      })
  }

  setFeature(feature: keyof DoorsWindowsFeaturesPayload, state: boolean): void {
    const modifiedFeatures = { ...this.doorsWindowsFeatures, [feature]: state }

    this.haService
      .post<DoorsWindowsFeaturesPayload>('/doors-windows-features', modifiedFeatures)
      .subscribe({
        next: (response) => {
          if (response.ok) {
            this.doorsWindowsFeatures = modifiedFeatures
          }
        }
      })
  }
}
