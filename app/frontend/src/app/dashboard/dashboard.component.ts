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
  dashboardItem: DashboardItem[] = []

  constructor() {
    this.dashboardItem = routes
      .filter((r) => !!r.data?.['title'] && !!r.data?.['icon'])
      .map((r) => {
        const hide = r.canActivate?.some((ca) => !ca())
        return {
          title: r.data?.['title'],
          icon: r.data?.['icon'],
          link: hide ? undefined : r.path
        }
      })
  }
}
