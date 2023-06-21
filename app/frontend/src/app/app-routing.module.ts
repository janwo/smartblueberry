import { NgModule, inject } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { ClimateComponent } from './climate/climate.component'
import { DashboardComponent } from './dashboard/dashboard.component'
import { SceneComponent } from './scene/scene.component'
import { SetupComponent } from './setup/setup.component'
import { HAService } from './ha.service'
import { LightComponent } from './light/light.component'
import { SecurityComponent } from './security/security.component'
import { PresenceComponent } from './presence/presence.component'
import { IrrigationComponent } from './irrigation/irrigation.component'

const RouteGuard = () => {
  return inject(HAService).isGloballyConnected()
}

export const routes: Routes = [
  {
    path: 'setup',
    data: { title: $localize`Setup`, icon: 'link-2-outline' },
    component: SetupComponent
  },
  {
    path: 'climate',
    canActivate: [RouteGuard],
    data: {
      title: $localize`Climate Settings`,
      icon: 'thermometer-outline'
    },
    component: ClimateComponent
  },
  {
    path: 'scenes',
    canActivate: [RouteGuard],
    data: { title: $localize`Scene Settings`, icon: 'film-outline' },
    component: SceneComponent
  },
  {
    path: 'light',
    canActivate: [RouteGuard],
    data: { title: $localize`Light Settings`, icon: 'bulb-outline' },
    component: LightComponent
  },
  {
    path: 'security',
    canActivate: [RouteGuard],
    data: { title: $localize`Security Settings`, icon: 'shield-outline' },
    component: SecurityComponent
  },
  {
    path: 'presence',
    canActivate: [RouteGuard],
    data: { title: $localize`Presence Settings`, icon: 'activity-outline' },
    component: PresenceComponent
  },
  {
    path: 'irrigation',
    canActivate: [RouteGuard],
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
