import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { StatusFarbenComponent } from './status-farben.component';

describe('StatusFarbenComponent', () => {
  let component: StatusFarbenComponent;
  let fixture: ComponentFixture<StatusFarbenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusFarbenComponent],
      // Services laden per HttpClient, die Seite nutzt den Router – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatusFarbenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});