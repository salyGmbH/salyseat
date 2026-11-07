import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { MitarbeiterComponent } from './mitarbeiter.component';

describe('MitarbeiterComponent', () => {
  let component: MitarbeiterComponent;
  let fixture: ComponentFixture<MitarbeiterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MitarbeiterComponent],
      // Services laden Daten per HttpClient – im Test ohne echtes Backend
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(MitarbeiterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});