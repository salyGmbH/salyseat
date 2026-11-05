import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservierungslisteComponent } from './reservierungsliste.component';

describe('ReservierungslisteComponent', () => {
  let component: ReservierungslisteComponent;
  let fixture: ComponentFixture<ReservierungslisteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservierungslisteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservierungslisteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
