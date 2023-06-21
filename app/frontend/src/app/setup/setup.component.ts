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

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss']
})
export class SetupComponent implements OnInit {
  protected authenticated = false
  protected setupUserConnectionForm: FormGroup
  protected setupGlobalConnectionForm: FormGroup
  protected isGloballyConnected = false

  constructor(public haService: HAService, private formBuilder: FormBuilder) {
    this.setupUserConnectionForm = this.formBuilder.group({})
    this.setupGlobalConnectionForm = this.formBuilder.group({
      connected: [false]
    })
  }
  ngOnInit(): void {
    this.haService.isGloballyConnected().subscribe({
      next: (connected) => {
        this.setupGlobalConnectionForm.controls['connected'].setValue(connected)
      }
    })
  }

  toggleUserAuthentication() {
    if (this.haService.isAuthenticated()) {
      this.haService.unauthenticate()
      return
    }

    this.haService.authenticate({ allowOAuthCall: true }).subscribe()
  }

  setupGlobalConnection() {
    this.setupGlobalConnectionForm.markAllAsTouched()
    if (this.setupGlobalConnectionForm.invalid) {
      return
    }

    this.haService.setGlobalConnection()
  }
}
