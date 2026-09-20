import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BehaviorSubject, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
@Component({ imports: [AsyncPipe, CurrencyPipe, DatePipe, RouterLink], templateUrl: './request-detail.page.html', styleUrl: './request-detail.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class RequestDetailPage {
  private readonly api = inject(ApiService); private readonly route = inject(ActivatedRoute); private readonly toast = inject(ToastService); readonly auth = inject(AuthService); private readonly refresh = new BehaviorSubject<void>(undefined);
  readonly request$ = this.refresh.pipe(switchMap(() => this.api.getRequest(Number(this.route.snapshot.paramMap.get('id')))));
  submit(id: number): void { this.api.submitRequest(id).pipe(tap(() => this.toast.show('Request submitted for approval.', 'success'))).subscribe(() => this.refresh.next()); }
}
