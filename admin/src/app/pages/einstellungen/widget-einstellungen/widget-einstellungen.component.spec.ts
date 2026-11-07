import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { WidgetEinstellungenComponent } from './widget-einstellungen.component';

describe('WidgetEinstellungenComponent', () => {
  let component: WidgetEinstellungenComponent;
  let fixture: ComponentFixture<WidgetEinstellungenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetEinstellungenComponent],
      // VenueService lädt per HttpClient – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(WidgetEinstellungenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
