import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { LoginResponse, Role, User } from './models';

const TOKEN_KEY = 'procurement.token';
const USER_KEY = 'procurement.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly currentUser = signal<User | null>(this.readUser());
  readonly user = this.currentUser.asReadonly();
  readonly authenticated = computed(() => Boolean(this.currentUser() && this.token));
  get token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  login(tenant: string, email: string, password: string) {
    return this.http.post<LoginResponse>('/api/v1/auth/login', { tenant, email, password }).pipe(tap(({ token, user }) => {
      localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); this.currentUser.set(user);
    }));
  }
  hasRole(roles: Role[]): boolean { return Boolean(this.user() && roles.includes(this.user()!.role)); }
  logout(): void {
    const hadToken = Boolean(this.token); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); this.currentUser.set(null);
    if (hadToken) this.http.post('/api/v1/auth/logout', {}).subscribe({ error: () => undefined });
    void this.router.navigateByUrl('/login');
  }
  clearSession(): void { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); this.currentUser.set(null); }
  private readUser(): User | null { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null; } catch { return null; } }
}
