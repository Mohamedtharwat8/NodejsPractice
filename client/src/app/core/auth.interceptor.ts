import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiErrorBody } from './models';
import { ToastService } from './toast.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService); const router = inject(Router); const toast = inject(ToastService); const token = auth.token;
  const tenantId = auth.user()?.tenantId;
  const authenticatedRequest = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}`, ...(tenantId ? { 'X-Tenant-Id': String(tenantId) } : {}) } }) : request;
  return next(authenticatedRequest).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status === 401 && !request.url.endsWith('/auth/login')) { auth.clearSession(); toast.show('Your session expired. Please sign in again.', 'error'); void router.navigateByUrl('/login'); }
    else if (!request.url.endsWith('/auth/login')) { const body = error.error as ApiErrorBody; toast.show(body?.error?.message || 'Something went wrong. Please try again.', 'error'); }
    return throwError(() => error);
  }));
};
