import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotizFloatComponent } from './notiz-float.component';

describe('NotizFloatComponent', () => {
  let component: NotizFloatComponent;
  let fixture: ComponentFixture<NotizFloatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotizFloatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotizFloatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
