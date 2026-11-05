import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SicherheitComponent } from './sicherheit.component';

describe('SicherheitComponent', () => {
  let component: SicherheitComponent;
  let fixture: ComponentFixture<SicherheitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SicherheitComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SicherheitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
