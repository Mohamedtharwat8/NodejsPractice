import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RequestFormPage } from './request-form.page';

describe('RequestFormPage', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [RequestFormPage], providers: [provideHttpClient(), provideRouter([])] }));
  it('manages dynamic line items and rejects zero values', () => {
    const fixture = TestBed.createComponent(RequestFormPage); const component = fixture.componentInstance;
    expect(component.items.length).toBe(1);
    component.addItem(); expect(component.items.length).toBe(2);
    component.items.at(1).controls.quantity.setValue(0);
    expect(component.items.at(1).controls.quantity.invalid).toBe(true);
    component.removeItem(1); expect(component.items.length).toBe(1);
  });
});
