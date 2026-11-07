import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { StatusFarbenComponent } from './status-farben.component';

describe('StatusFarbenComponent', () => {
  let component: StatusFarbenComponent;
  let fixture: ComponentFixture<StatusFarbenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusFarbenComponent],
      // Services laden Daten per HttpClient – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting()],
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