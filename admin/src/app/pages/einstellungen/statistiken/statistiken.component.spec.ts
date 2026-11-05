import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatistikenComponent } from './statistiken.component';

describe('StatistikenComponent', () => {
  let component: StatistikenComponent;
  let fixture: ComponentFixture<StatistikenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatistikenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatistikenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
