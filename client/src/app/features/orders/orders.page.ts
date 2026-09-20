import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, forkJoin, map, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { PurchaseRequest } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({ imports: [AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe, ReactiveFormsModule], templateUrl: './orders.page.html', styleUrl: './orders.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class OrdersPage {
  private readonly api = inject(ApiService); private readonly toast = inject(ToastService); private readonly refresh = new BehaviorSubject<void>(undefined);
  readonly showCreate = signal(false); readonly suggestions = signal<Array<{ name: string; score: number; rationale: string }>>([]); readonly recommending = signal(false);
  readonly form = new FormGroup({ prId: new FormControl<number | null>(null, Validators.required), vendorId: new FormControl<number | null>(null, Validators.required) });
  readonly data$ = this.refresh.pipe(switchMap(() => forkJoin({ orders: this.api.listOrders(), requests: this.api.listRequests('APPROVED'), vendors: this.api.listVendors('ACTIVE') })), map(({ orders, requests, vendors }) => ({ orders: orders.data, requests: requests.data.filter((request) => !request.order), vendors: vendors.data })));
  create(): void { if (this.form.invalid) return; const { prId, vendorId } = this.form.getRawValue(); this.api.createOrder(prId!, vendorId!).pipe(tap(() => this.toast.show('Purchase order issued.', 'success'))).subscribe(() => { this.showCreate.set(false); this.form.reset(); this.refresh.next(); }); }
  cancel(id: number): void { if (!window.confirm('Cancel this purchase order?')) return; this.api.cancelOrder(id).pipe(tap(() => this.toast.show('Purchase order cancelled.', 'success'))).subscribe(() => this.refresh.next()); }
  recommend(requests: PurchaseRequest[]): void { const request = requests.find((item) => item.id === this.form.controls.prId.value); if (!request) return; this.recommending.set(true); this.api.recommendVendors({ title: request.title, justification: request.justification, items: (request.items || []).map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: +item.unitPrice })) }).subscribe({ next: (result) => { this.suggestions.set(result.vendors); this.recommending.set(false); }, error: () => this.recommending.set(false) }); }
}
