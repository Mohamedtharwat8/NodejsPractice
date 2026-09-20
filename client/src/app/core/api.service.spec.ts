import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); api = TestBed.inject(ApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());
  it('uses the approval contract', () => {
    api.decideRequest(42, 'approve', 'Within budget').subscribe();
    const request = http.expectOne('/api/v1/purchase-requests/42/approve');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ comment: 'Within budget' });
    request.flush({ id: 42, status: 'APPROVED' });
  });
  it('uses tenant audit filters as query parameters', () => {
    api.listAudit({ entity: 'Vendor', action: 'CREATE' }).subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/audit');
    expect(request.request.params.get('entity')).toBe('Vendor');
    request.flush({ data: [] });
  });
});
