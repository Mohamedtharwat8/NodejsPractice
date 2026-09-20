export type Role = 'REQUESTER' | 'APPROVER' | 'PROCUREMENT' | 'ADMIN';
export interface User { id: number; tenantId: number; name: string; email: string; role: Role; }
export interface LoginResponse { token: string; user: User; }
export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export interface PurchaseRequest {
  id: number; title: string; justification?: string;
  requesterId?: number; status: RequestStatus;
  totalAmount: string | number; createdAt: string;
  requester?: Pick<User, 'id' | 'name' | 'email'>;
  items?: Array<{ description: string; quantity: number; unitPrice: string | number }>;
  approval?: { decision: 'APPROVED' | 'REJECTED'; comment?: string; decidedAt: string; approver?: Pick<User, 'id' | 'name'> };
  order?: PurchaseOrder | null;
}
export interface Page<T> { data: T[]; total?: number; nextCursor?: string | null; }
export interface Vendor { id: number; name: string; email?: string; phone?: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; }
export interface PurchaseOrder { id: number; prId: number; vendorId: number; poNumber: string; status: 'ISSUED' | 'CANCELLED'; issuedAt: string; pr?: PurchaseRequest; vendor?: Vendor; }
export interface AuditEvent { id: string; at: string; actorId: number | null; action: string; entity: string; entityId: number; before: Record<string, unknown> | null; after: Record<string, unknown> | null; correlationId: string | null; }
export interface Notification { id: number; type: string; title: string; entity: string; entityId: number; readAt: string | null; createdAt: string; }
export interface WebhookSettings { url: string | null; configured: boolean; secret?: string; }
export interface ApiErrorBody { error?: { code?: string; message?: string; details?: unknown }; }
