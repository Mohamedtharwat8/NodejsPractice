export type Role = 'REQUESTER' | 'APPROVER' | 'PROCUREMENT' | 'ADMIN';
export interface User { id: number; tenantId: number; name: string; email: string; role: Role; }
export interface LoginResponse { token: string; user: User; }
export interface PurchaseRequest {
  id: number; title: string; justification?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  totalAmount: string | number; createdAt: string;
  requester?: Pick<User, 'id' | 'name' | 'email'>;
  items?: Array<{ description: string; quantity: number; unitPrice: string | number }>;
}
export interface Page<T> { data: T[]; total?: number; nextCursor?: string | null; }
