import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { A11yWidgetComponent } from './components/a11y-widget/a11y-widget.component';

@Component({
  selector: 'wdg-root',
  standalone: true,
  imports: [RouterOutlet, A11yWidgetComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'salyseat-widget';
}
