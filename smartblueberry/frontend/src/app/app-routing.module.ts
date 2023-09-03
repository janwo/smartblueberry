import { NgModule, inject } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { DoorsWindowsComponent as DoorsWindowsComponent } from './doors-windows/doors-windows.component'
import { DashboardComponent } from './dashboard/dashboard.component'
import { SetupComponent } from './setup/setup.component'
import { RouteGuard } from './ha.service'
import { LightComponent } from './light/light.component'
import { PresenceComponent } from './presence/presence.component'
import { IrrigationComponent } from './irrigation/irrigation.component'

export const routes: Routes = [
  {
    path: 'setup',
    data: { title: $localize`Setup`, icon: 'link-2-outline' },
    component: SetupComponent
  },
  {
    path: 'presence',
    canActivate: [RouteGuard.isGloballyConnected],
    data: { title: $localize`Presence Settings`, icon: 'activity-outline' },
    component: PresenceComponent
  },
  {
    path: 'doors+windows',
    canActivate: [RouteGuard.isGloballyConnected],
    data: {
      title: $localize`Doors & Windows`,
      icon: 'unlock-outline'
    },
    component: DoorsWindowsComponent
  },
  {
    path: 'light',
    canActivate: [RouteGuard.isGloballyConnected],
    data: { title: $localize`Light Settings`, icon: 'bulb-outline' },
    component: LightComponent
  },
  {
    path: 'irrigation',
    canActivate: [RouteGuard.isGloballyConnected],
    data: { title: $localize`Irrigation Settings`, icon: 'umbrella-outline' },
    component: IrrigationComponent
  },
  {
    path: '',
    pathMatch: 'full',
    component: DashboardComponent
  }
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
