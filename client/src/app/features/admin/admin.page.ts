import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Role } from '../../core/models';
import { ToastService } from '../../core/toast.service';
@Component({ imports: [AsyncPipe, CurrencyPipe, ReactiveFormsModule], templateUrl: './admin.page.html', styleUrl: './admin.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AdminPage {
  private readonly api = inject(ApiService); private readonly toast = inject(ToastService); readonly secret = signal('');
  readonly webhook$ = this.api.getWebhook();
  readonly userForm = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required] }), email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }), password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }), role: new FormControl<Role>('REQUESTER', { nonNullable: true }), approvalLimit: new FormControl<number | null>(null, { validators: [Validators.min(0)] }) });
  readonly threshold$ = this.api.getApprovalThreshold();
  readonly thresholdForm = new FormGroup({ threshold: new FormControl<number | null>(null, { validators: [Validators.min(0)] }) });
  readonly webhookForm = new FormGroup({ url: new FormControl('', { nonNullable: true }), rotateSecret: new FormControl(false, { nonNullable: true }) });
  createUser(): void { if (this.userForm.invalid) return; this.api.registerUser(this.userForm.getRawValue()).subscribe(() => { this.toast.show('User account created.', 'success'); this.userForm.reset({ name: '', email: '', password: '', role: 'REQUESTER', approvalLimit: null }); }); }
  saveThreshold(): void { if (this.thresholdForm.invalid) return; this.api.saveApprovalThreshold(this.thresholdForm.controls.threshold.value).subscribe((result) => { this.thresholdForm.reset({ threshold: result.threshold }); this.toast.show(result.threshold === null ? 'Approval limits switched off.' : 'Approval threshold saved.', 'success'); }); }
  saveWebhook(): void { const { url, rotateSecret } = this.webhookForm.getRawValue(); this.api.saveWebhook(url.trim() || null, rotateSecret).subscribe((result) => { this.secret.set(result.secret || ''); this.toast.show(url ? 'Webhook settings saved.' : 'Webhook disabled.', 'success'); }); }
}
