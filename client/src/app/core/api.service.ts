import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Page, PurchaseRequest } from './models';
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  listRequests(status?: string) { const params = status ? new HttpParams().set('status', status) : undefined; return this.http.get<Page<PurchaseRequest>>('/api/v1/purchase-requests', { params }); }
  createRequest(input: { title: string; justification?: string; items: Array<{ description: string; quantity: number; unitPrice: number }> }) { return this.http.post<PurchaseRequest>('/api/v1/purchase-requests', input); }
  draftJustification(input: { title: string; items: Array<{ description: string; quantity: number; unitPrice: number }> }) { return this.http.post<{ justification: string }>('/ai/draft-justification', input); }
}
