import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllgemeinComponent } from './allgemein.component';

describe('AllgemeinComponent', () => {
  let component: AllgemeinComponent;
  let fixture: ComponentFixture<AllgemeinComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllgemeinComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AllgemeinComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});