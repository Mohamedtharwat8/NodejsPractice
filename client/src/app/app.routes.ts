import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage) },
  {
    path: '', canActivate: [authGuard], loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'requests', loadComponent: () => import('./features/requests/request-list.page').then((m) => m.RequestListPage) },
      { path: 'requests/new', loadComponent: () => import('./features/requests/request-form.page').then((m) => m.RequestFormPage) },
      { path: 'approvals', canActivate: [roleGuard(['APPROVER', 'ADMIN'])], loadComponent: () => import('./features/shared/coming-soon.page').then((m) => m.ApprovalsPage) },
      { path: 'vendors', loadComponent: () => import('./features/shared/coming-soon.page').then((m) => m.VendorsPage) },
      { path: 'orders', canActivate: [roleGuard(['PROCUREMENT', 'ADMIN'])], loadComponent: () => import('./features/shared/coming-soon.page').then((m) => m.OrdersPage) },
      { path: 'audit', canActivate: [roleGuard(['ADMIN'])], loadComponent: () => import('./features/shared/coming-soon.page').then((m) => m.AuditPage) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
