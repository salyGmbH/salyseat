import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ReservierungslisteComponent } from './reservierungsliste.component';

describe('ReservierungslisteComponent', () => {
  let component: ReservierungslisteComponent;
  let fixture: ComponentFixture<ReservierungslisteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservierungslisteComponent],
      // ReservationsService lädt Daten per HttpClient – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservierungslisteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
