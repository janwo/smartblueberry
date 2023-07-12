import {
  getAuth,
  createConnection,
  subscribeEntities,
  ERR_HASS_HOST_REQUIRED
} from 'home-assistant-js-websocket'
import { Component, OnInit } from '@angular/core'
import { FormBuilder, FormGroup, Validators } from '@angular/forms'
import { HAService } from '../ha.service'
import { environment } from 'src/environments/environment'
import { of } from 'rxjs'

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
