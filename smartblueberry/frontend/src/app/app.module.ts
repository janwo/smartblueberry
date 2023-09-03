import { NgModule } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DoorsWindowsComponent } from './doors-windows/doors-windows.component'
import { SvgIconComponent } from './svg-icon/svg-icon.component'
import { EntitySchemaComponent } from './entity-schema/entity-schema.component'
import { HttpClientModule } from '@angular/common/http'
import { DashboardComponent } from './dashboard/dashboard.component'
import { SetupComponent } from './setup/setup.component'
import { HAService } from './ha.service'
import { ReactiveFormsModule } from '@angular/forms'
import { AccordionComponent } from './accordion/accordion.component'
import { MapPipe } from './map.pipe'
import { StateDescriptionPipe } from './state-description.pipe'
import { LightComponent } from './light/light.component'
import { PresenceComponent } from './presence/presence.component'
import { ErrorComponent } from './error/error.component'
import { IrrigationComponent } from './irrigation/irrigation.component'
import { IrrigationChartComponent } from './irrigation-chart/irrigation-chart.component'
import { NgChartsModule } from 'ng2-charts'
import { SelectComponent } from './select/select.component'

@NgModule({
  declarations: [
    AppComponent,
    DoorsWindowsComponent,
    SvgIconComponent,
    DashboardComponent,
    SetupComponent,
    AccordionComponent,
    IrrigationComponent,
    MapPipe,
    EntitySchemaComponent,
    StateDescriptionPipe,
    LightComponent,
    PresenceComponent,
    ErrorComponent,
    IrrigationChartComponent,
    SelectComponent
  ],
  imports: [
    BrowserModule,
    NgChartsModule,
    HttpClientModule,
    ReactiveFormsModule,
    AppRoutingModule,
    BrowserAnimationsModule
  ],
  providers: [HAService],
  bootstrap: [AppComponent]
})
export class AppModule {}
