import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservierungenComponent } from './reservierungen.component';

describe('ReservierungenComponent', () => {
  let component: ReservierungenComponent;
  let fixture: ComponentFixture<ReservierungenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservierungenComponent]
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
