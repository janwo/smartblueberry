import { Component, OnInit } from "@angular/core"
import { HAService } from "./ha.service"
import { error } from "console"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  constructor(private haService: HAService) {}

  ngOnInit(): void {
    this.haService.authenticate().subscribe()
  }
}
