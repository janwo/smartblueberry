import { Component, OnInit } from "@angular/core"
import { forkJoin } from "rxjs"
import { ItemSchema } from "../item-schema/item-schema.component"
import { HAService, Item, GetItemListResponse } from "../ha.service"

@Component({
  selector: "app-light",
  templateUrl: "./light.component.html",
  styleUrls: ["./light.component.scss"],
})
export class LightComponent implements OnInit {
  constructor(private haService: HAService) {}

  schema = {
    lightSwitchableItems: {
      tags: ["Lightbulb", "WallSwitch", "PowerOutlet"],
      description: $localize`Light Switchable Item`,
      childs: [{ tags: ["Switch"] }],
    },
    astroSunItems: {
      tags: ["CoreAstroSun"],
      description: $localize`Astro Sun State`,
    },
    lightMeasurementItems: {
      tagRelationship: "and" as ItemSchema["tagRelationship"],
      tags: ["Light", "Measurement"],
      description: $localize`Light measurement item`,
    },
  }

  lightSwitchableItems: Item[] = []
  lightMeasurementItems: Item[] = []
  astroItems: Item[] = []

  ngOnInit(): void {
    forkJoin([
      this.haService.light.switchableItems(),
      this.haService.light.measurementItems(),
      this.haService.light.astroItems(),
    ]).subscribe({
      next: (items: GetItemListResponse[]) => {
        this.lightSwitchableItems = items[0].data
        this.lightMeasurementItems = items[1].data
        this.astroItems = items[2].data
      },
    })
  }
}
