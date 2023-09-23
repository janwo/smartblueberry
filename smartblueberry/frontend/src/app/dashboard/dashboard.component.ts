import { Component, Injector, OnInit, inject } from '@angular/core'
import { routes } from '../app-routing.module'
import { HAService } from '../ha.service'

interface DashboardItem {
  title: string
  icon: string
  link?: string
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  constructor(private haService: HAService) {}

  get dashboardItems(): DashboardItem[] {
    return routes
      .filter((r) => !!r.data?.['title'] && !!r.data?.['icon'])
      .map((r) => {
        const hide = r.canActivate?.some((canActivate) => {
          switch (canActivate.name) {
            case 'isGloballyConnected':
              return !this.haService.isGloballyConnected()
            case 'isAuthenticated':
              return !this.haService.isAuthenticated()
            default:
              return false
          }
        })

        return {
          title: r.data?.['title'],
          icon: r.data?.['icon'],
          link: hide ? undefined : r.path
        }
      })
  }
}
