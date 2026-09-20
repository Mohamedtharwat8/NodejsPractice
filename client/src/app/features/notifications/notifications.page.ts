import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BehaviorSubject, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
@Component({ imports: [AsyncPipe, DatePipe], templateUrl: './notifications.page.html', styleUrl: './notifications.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class NotificationsPage {
  private readonly api = inject(ApiService); private readonly toast = inject(ToastService); private readonly refresh = new BehaviorSubject<void>(undefined); readonly notifications$ = this.refresh.pipe(switchMap(() => this.api.listNotifications()));
  read(id: number): void { this.api.readNotification(id).subscribe(() => this.refresh.next()); }
  readAll(): void { this.api.readAllNotifications().pipe(tap((result) => this.toast.show(`${result.updated} notification${result.updated === 1 ? '' : 's'} marked read.`, 'success'))).subscribe(() => this.refresh.next()); }
}
