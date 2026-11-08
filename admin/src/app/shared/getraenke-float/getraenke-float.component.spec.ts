import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GetraenkeFloatComponent } from './getraenke-float.component';

describe('GetraenkeFloatComponent', () => {
  let component: GetraenkeFloatComponent;
  let fixture: ComponentFixture<GetraenkeFloatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GetraenkeFloatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GetraenkeFloatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
