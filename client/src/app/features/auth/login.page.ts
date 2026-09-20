import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
@Component({ imports: [ReactiveFormsModule], templateUrl: './login.page.html', styleUrl: './login.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class LoginPage {
  private readonly auth = inject(AuthService); private readonly router = inject(Router);
  readonly busy = signal(false); readonly error = signal('');
  readonly form = new FormGroup({ tenant: new FormControl('acme', { nonNullable: true, validators: [Validators.required] }), email: new FormControl('requester@example.com', { nonNullable: true, validators: [Validators.required, Validators.email] }), password: new FormControl('Password123!', { nonNullable: true, validators: [Validators.required] }) });
  submit(): void { if (this.form.invalid) return; this.busy.set(true); this.error.set(''); const { tenant, email, password } = this.form.getRawValue(); this.auth.login(tenant, email, password).subscribe({ next: () => void this.router.navigateByUrl('/dashboard'), error: (error: HttpErrorResponse) => { this.busy.set(false); this.error.set(error.error?.error?.message || 'Could not sign in. Check your workspace and credentials.'); } }); }
}
