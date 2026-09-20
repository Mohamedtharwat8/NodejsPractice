import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { PurchaseRequest } from '../../core/models';
interface RequestListState { data: PurchaseRequest[]; loading: boolean; error: boolean; }
@Component({ imports: [AsyncPipe, CurrencyPipe, DatePipe, RouterLink], templateUrl: './request-list.page.html', styleUrl: './request-list.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class RequestListPage {
  private readonly api = inject(ApiService);
  readonly state$ = this.api.listRequests().pipe(
    map((page): RequestListState => ({ data: page.data, loading: false, error: false })),
    catchError(() => of<RequestListState>({ data: [], loading: false, error: true })),
    startWith<RequestListState>({ data: [], loading: true, error: false }),
  );
}
