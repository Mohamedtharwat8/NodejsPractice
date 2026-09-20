// Generated from the API OpenAPI document. Do not edit by hand.

/* eslint-disable */

export type Approval = {
  "decision"?: "APPROVED" | "REJECTED";
  "comment"?: string;
  "approverId"?: number;
  "decidedAt"?: string;
};

export type AuditEvent = {
  "id"?: string;
  "at"?: string;
  "actorId"?: string;
  "action"?: string;
  "entity"?: string;
  "entityId"?: number;
  "before"?: string;
  "after"?: string;
  "correlationId"?: string;
};

export type AuditPage = {
  "data"?: Array<AuditEvent>;
  "nextCursor"?: string;
  "pageSize"?: number;
};

export type DeadLetterList = {
  "data"?: Array<{
  "id"?: string;
  "job"?: "notify" | "webhook";
  "tenantId"?: number;
  "type"?: string;
  "eventId"?: number;
  "failedReason"?: string;
  "attemptsMade"?: number;
  "parkedAt"?: string;
}>;
};

export type Error = {
  "error"?: {
  "code": "VALIDATION_ERROR" | "INVALID_JSON" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";
  "message": string;
  "details"?: Array<{

}>;
};
};

export type LoginResponse = {
  "token"?: string;
  "user"?: User;
};

export type Notification = {
  "id"?: number;
  "type"?: string;
  "title"?: string;
  "entity"?: string;
  "entityId"?: number;
  "readAt"?: string;
  "createdAt"?: string;
};

export type NotificationPage = {
  "data"?: Array<Notification>;
  "total"?: number;
  "page"?: number;
  "pageSize"?: number;
  "nextCursor"?: string;
};

export type PRItem = {
  "id"?: number;
  "description"?: string;
  "quantity"?: number;
  "unitPrice"?: string;
};

export type PurchaseOrder = {
  "id"?: number;
  "prId"?: number;
  "vendorId"?: number;
  "poNumber"?: string;
  "status"?: "ISSUED" | "CANCELLED";
  "issuedAt"?: string;
};

export type PurchaseOrderPage = {
  "data"?: Array<PurchaseOrder>;
  "total"?: number;
  "page"?: number;
  "pageSize"?: number;
  "nextCursor"?: string;
};

export type PurchaseRequest = {
  "id"?: number;
  "requesterId"?: number;
  "title"?: string;
  "justification"?: string;
  "status"?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  "totalAmount"?: string;
  "items"?: Array<PRItem>;
  "approval"?: Approval | string;
};

export type PurchaseRequestPage = {
  "data"?: Array<PurchaseRequest>;
  "total"?: number;
  "page"?: number;
  "pageSize"?: number;
  "nextCursor"?: string;
};

export type Requeued = {
  "requeued"?: string;
  "eventId"?: number;
};

export type Tenant = {
  "id"?: number;
  "name"?: string;
  "slug"?: string;
  "status"?: "ACTIVE" | "SUSPENDED";
};

export type TenantCreated = {
  "tenant"?: Tenant;
  "admin"?: User;
};

export type Updated = {
  "updated"?: number;
};

export type User = {
  "id"?: number;
  "tenantId"?: number;
  "name"?: string;
  "email"?: string;
  "role"?: "REQUESTER" | "APPROVER" | "PROCUREMENT" | "ADMIN";
  "createdAt"?: string;
};

export type Vendor = {
  "id"?: number;
  "name"?: string;
  "email"?: string;
  "phone"?: string;
  "status"?: "ACTIVE" | "INACTIVE";
};

export type VendorPage = {
  "data"?: Array<Vendor>;
  "total"?: number;
  "page"?: number;
  "pageSize"?: number;
  "nextCursor"?: string;
};

export type WebhookSettings = {
  "url"?: string;
  "hasSecret"?: boolean;
  "secret"?: string;
};

export type ApiPath = "/audit" | "/auth/login" | "/auth/logout" | "/auth/me" | "/auth/register" | "/notifications" | "/notifications/read-all" | "/notifications/{id}/read" | "/platform/dead-letters" | "/platform/dead-letters/{id}/retry" | "/platform/tenants" | "/platform/tenants/{id}/status" | "/purchase-orders" | "/purchase-orders/{id}" | "/purchase-orders/{id}/cancel" | "/purchase-requests" | "/purchase-requests/{id}" | "/purchase-requests/{id}/approve" | "/purchase-requests/{id}/reject" | "/purchase-requests/{id}/submit" | "/settings/webhook" | "/vendors" | "/vendors/{id}";

