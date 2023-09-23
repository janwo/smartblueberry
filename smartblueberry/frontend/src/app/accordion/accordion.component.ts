import { Component, EventEmitter, Input, Output } from '@angular/core'

@Component({
  selector: 'app-accordion',
  templateUrl: './accordion.component.html',
  styleUrls: ['./accordion.component.scss']
})
export class AccordionComponent {
  @Input() public title?: string
  @Input() public visible = false
  @Input() public hint?: string
  @Input() public hintClasses?: string | string[]
  @Output() public visibleChange = new EventEmitter<boolean>()

  toggle() {
    this.visible = !this.visible
    this.visibleChange.emit(this.visible)
  }
}
