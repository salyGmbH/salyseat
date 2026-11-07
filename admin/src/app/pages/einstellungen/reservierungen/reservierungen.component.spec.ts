import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ReservierungenComponent } from './reservierungen.component';

describe('ReservierungenComponent', () => {
  let component: ReservierungenComponent;
  let fixture: ComponentFixture<ReservierungenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservierungenComponent],
      // Services laden per HttpClient, die Seite nutzt den Router – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservierungenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
