import { Component } from '@angular/core'
import { HAService } from '../ha.service'

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss']
})
export class SetupComponent {
  constructor(protected haService: HAService) {}

  authenticate() {
    this.haService.authenticate({ allowOAuthCall: true }).subscribe()
  }

  unauthenticate() {
    this.haService.unauthenticate()
  }

  setGlobalConnection() {
    this.haService.setGlobalConnection()
  }

  unsetGlobalConnection() {
    this.haService.unsetGlobalConnection()
  }
}
