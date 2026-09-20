import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { StatusCountPipe } from './status-count.pipe';
@Component({ imports: [AsyncPipe, CurrencyPipe, RouterLink, StatusCountPipe], templateUrl: './dashboard.page.html', styleUrl: './dashboard.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class DashboardPage {
  readonly auth = inject(AuthService); private readonly api = inject(ApiService);
  readonly data$ = forkJoin({ requests: this.api.listRequests(), orders: this.auth.hasRole(['PROCUREMENT','ADMIN']) ? this.api.listOrders() : of({ data: [] }) }).pipe(
    switchMap(({ requests, orders }) => { const spend = orders.data.map((order) => ({ category: order.vendor?.name || 'Other', amount: +(order.pr?.totalAmount || 0) })); return (spend.length ? this.api.spendSummary(spend) : of({ narrative: 'Issue purchase orders to unlock an AI spend brief.', total: 0 })).pipe(map((summary) => ({ requests: requests.data, orders: orders.data, summary }))); }),
    startWith({ requests: [], orders: [], summary: { narrative: 'Loading workspace data…', total: 0 } }),
  );
}
