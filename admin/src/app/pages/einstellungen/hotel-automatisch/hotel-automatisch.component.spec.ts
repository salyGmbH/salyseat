import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HotelAutomatischComponent } from './hotel-automatisch.component';

describe('HotelAutomatischComponent', () => {
  let component: HotelAutomatischComponent;
  let fixture: ComponentFixture<HotelAutomatischComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HotelAutomatischComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HotelAutomatischComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});