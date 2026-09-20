import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';
export const authGuard: CanActivateFn = () => { const auth = inject(AuthService); return auth.authenticated() || inject(Router).createUrlTree(['/login']); };
export const guestGuard: CanActivateFn = () => { const auth = inject(AuthService); return !auth.authenticated() || inject(Router).createUrlTree(['/dashboard']); };
export const roleGuard = (roles: Role[]): CanActivateFn => () => { const auth = inject(AuthService); return auth.hasRole(roles) || inject(Router).createUrlTree(['/dashboard']); };
