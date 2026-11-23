import { Directive, HostListener, ElementRef, inject } from '@angular/core';

/**
 * `input[type=date]` öffnet den nativen Kalender sonst nur beim exakten Treffer
 * auf das winzige Browser-Icon. Diese Direktive öffnet ihn bei Klick auf das
 * gesamte Feld via `showPicker()` (Chrome/Edge; Browser ohne Support ignorieren es).
 */
@Directive({
  selector: 'input[type=date]',
  standalone: true,
})
export class OpenDatePickerDirective {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  @HostListener('click')
  onClick(): void {
    this.el.nativeElement.showPicker?.();
  }
}