import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WidgetEinstellungenComponent } from './widget-einstellungen.component';

describe('WidgetEinstellungenComponent', () => {
  let component: WidgetEinstellungenComponent;
  let fixture: ComponentFixture<WidgetEinstellungenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetEinstellungenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WidgetEinstellungenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
