import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestaurantplanComponent } from './restaurantplan.component';

describe('RestaurantplanComponent', () => {
  let component: RestaurantplanComponent;
  let fixture: ComponentFixture<RestaurantplanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestaurantplanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RestaurantplanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
