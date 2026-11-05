import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusFarbenComponent } from './status-farben.component';

describe('StatusFarbenComponent', () => {
  let component: StatusFarbenComponent;
  let fixture: ComponentFixture<StatusFarbenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusFarbenComponent]
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