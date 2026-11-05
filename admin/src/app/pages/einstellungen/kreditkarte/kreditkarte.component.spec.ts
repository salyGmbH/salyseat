import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KreditkarteComponent } from './kreditkarte.component';

describe('KreditkarteComponent', () => {
  let component: KreditkarteComponent;
  let fixture: ComponentFixture<KreditkarteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KreditkarteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KreditkarteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});