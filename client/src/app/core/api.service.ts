import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuditEvent, Notification, Page, PurchaseOrder, PurchaseRequest, RequestStatus, Role, User, Vendor, WebhookSettings } from './models';

export interface RequestInput { title: string; justification?: string; items: Array<{ description: string; quantity: number; unitPrice: number }>; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  listRequests(status?: RequestStatus) { return this.http.get<Page<PurchaseRequest>>('/api/v1/purchase-requests', { params: status ? { status } : {} }); }
  getRequest(id: number) { return this.http.get<PurchaseRequest>(`/api/v1/purchase-requests/${id}`); }
  createRequest(input: RequestInput) { return this.http.post<PurchaseRequest>('/api/v1/purchase-requests', input); }
  updateRequest(id: number, input: Partial<RequestInput>) { return this.http.patch<PurchaseRequest>(`/api/v1/purchase-requests/${id}`, input); }
  submitRequest(id: number) { return this.http.post<PurchaseRequest>(`/api/v1/purchase-requests/${id}/submit`, {}); }
  decideRequest(id: number, decision: 'approve' | 'reject', comment: string) { return this.http.post<PurchaseRequest>(`/api/v1/purchase-requests/${id}/${decision}`, { comment }); }
  listVendors(status?: Vendor['status']) { return this.http.get<Page<Vendor>>('/api/v1/vendors', { params: status ? { status } : {} }); }
  createVendor(input: Pick<Vendor, 'name'> & Partial<Pick<Vendor, 'email' | 'phone'>>) { return this.http.post<Vendor>('/api/v1/vendors', input); }
  updateVendor(id: number, input: Partial<Pick<Vendor, 'name' | 'email' | 'phone' | 'status'>>) { return this.http.patch<Vendor>(`/api/v1/vendors/${id}`, input); }
  deactivateVendor(id: number) { return this.http.delete<Vendor>(`/api/v1/vendors/${id}`); }
  listOrders(status?: PurchaseOrder['status']) { return this.http.get<Page<PurchaseOrder>>('/api/v1/purchase-orders', { params: status ? { status } : {} }); }
  createOrder(prId: number, vendorId: number) { return this.http.post<PurchaseOrder>('/api/v1/purchase-orders', { prId, vendorId }); }
  cancelOrder(id: number) { return this.http.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/cancel`, {}); }
  listAudit(filters: Record<string, string | number | undefined>) { let params = new HttpParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params = params.set(key, String(value)); return this.http.get<Page<AuditEvent>>('/api/v1/audit', { params }); }
  listNotifications(unread?: boolean) { return this.http.get<Page<Notification>>('/api/v1/notifications', { params: unread === undefined ? {} : { unread: String(unread) } }); }
  readNotification(id: number) { return this.http.post<Notification>(`/api/v1/notifications/${id}/read`, {}); }
  readAllNotifications() { return this.http.post<{ updated: number }>('/api/v1/notifications/read-all', {}); }
  registerUser(input: { name: string; email: string; password: string; role: Role; approvalLimit?: number | null }) { return this.http.post<User>('/api/v1/auth/register', input); }
  getApprovalThreshold() { return this.http.get<{ threshold: number | null }>('/api/v1/settings/approval'); }
  saveApprovalThreshold(threshold: number | null) { return this.http.put<{ threshold: number | null }>('/api/v1/settings/approval', { threshold }); }
  getWebhook() { return this.http.get<WebhookSettings>('/api/v1/settings/webhook'); }
  saveWebhook(url: string | null, rotateSecret = false) { return this.http.put<WebhookSettings>('/api/v1/settings/webhook', { url, rotateSecret }); }
  draftJustification(input: RequestInput) { return this.http.post<{ justification: string; interactionId: string }>('/ai/draft-justification', input); }
  recommendVendors(input: RequestInput) { return this.http.post<{ vendors: Array<{ name: string; score: number; rationale: string }> }>('/ai/vendor-recommendation', input); }
  spendSummary(spend: Array<{ category: string; amount: number }>) { return this.http.post<{ narrative: string; total: number }>('/ai/spend-summary', { spend }); }
}
