import { AsyncPipe, DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuditEvent } from '../../core/models';
@Component({ imports: [AsyncPipe, DatePipe, JsonPipe, ReactiveFormsModule], templateUrl: './audit.page.html', styleUrl: './audit.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AuditPage {
  private readonly api = inject(ApiService); private readonly query = new BehaviorSubject<Record<string, string>>({}); readonly selected = signal<AuditEvent | null>(null);
  readonly form = new FormGroup({ entity: new FormControl('', { nonNullable: true }), action: new FormControl('', { nonNullable: true }), from: new FormControl('', { nonNullable: true }), to: new FormControl('', { nonNullable: true }) });
  readonly events$ = this.query.pipe(switchMap((filters) => this.api.listAudit(filters)));
  search(): void { const value = this.form.getRawValue(); this.query.next({ ...value, from: value.from ? new Date(`${value.from}T00:00:00Z`).toISOString() : '', to: value.to ? new Date(`${value.to}T23:59:59Z`).toISOString() : '' }); }
}
