import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, merge, switchMap, tap, timer } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PurchaseRequest } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({ imports: [AsyncPipe, CurrencyPipe, DatePipe, ReactiveFormsModule], templateUrl: './approvals.page.html', styleUrl: './approvals.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class ApprovalsPage {
  private readonly api = inject(ApiService); readonly auth = inject(AuthService); private readonly toast = inject(ToastService); private readonly refresh = new BehaviorSubject<void>(undefined);
  readonly selected = signal<PurchaseRequest | null>(null); readonly comment = new FormControl('', { nonNullable: true });
  readonly queue$ = merge(timer(0, 15000), this.refresh).pipe(switchMap(() => this.api.listRequests('SUBMITTED')));
  choose(request: PurchaseRequest): void { this.selected.set(request); this.comment.setValue(''); }
  decide(decision: 'approve' | 'reject'): void { const request = this.selected(); if (!request) return; this.api.decideRequest(request.id, decision, this.comment.value).pipe(tap(() => this.toast.show(`Request ${decision === 'approve' ? 'approved' : 'rejected'}.`, 'success'))).subscribe(() => { this.selected.set(null); this.refresh.next(); }); }
}
