import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Vendor } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({ imports: [AsyncPipe, DatePipe, ReactiveFormsModule], templateUrl: './vendors.page.html', styleUrl: './vendors.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class VendorsPage implements OnInit {
  private readonly api = inject(ApiService); readonly auth = inject(AuthService); private readonly toast = inject(ToastService); private readonly refresh = new BehaviorSubject<void>(undefined);
  readonly search = new FormControl('', { nonNullable: true }); readonly status = new FormControl<Vendor['status'] | ''>('', { nonNullable: true }); readonly editing = signal<Vendor | null>(null); readonly showForm = signal(false);
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required] }), email: new FormControl('', { nonNullable: true, validators: [Validators.email] }), phone: new FormControl('', { nonNullable: true }) });
  readonly vendors$ = combineLatest([this.refresh.pipe(switchMap(() => this.api.listVendors(this.status.value || undefined))), this.search.valueChanges.pipe(startWith(''), debounceTime(250), distinctUntilChanged())]).pipe(map(([page, query]) => page.data.filter((vendor) => `${vendor.name} ${vendor.email || ''}`.toLowerCase().includes(query.trim().toLowerCase()))));
  ngOnInit(): void {}
  reload(): void { this.refresh.next(); }
  open(vendor?: Vendor): void { this.editing.set(vendor || null); this.form.reset({ name: vendor?.name || '', email: vendor?.email || '', phone: vendor?.phone || '' }); this.showForm.set(true); }
  save(): void { if (this.form.invalid) return; const value = this.form.getRawValue(); const operation = this.editing() ? this.api.updateVendor(this.editing()!.id, value) : this.api.createVendor(value); operation.pipe(tap(() => this.toast.show(`Vendor ${this.editing() ? 'updated' : 'created'}.`, 'success'))).subscribe(() => { this.showForm.set(false); this.reload(); }); }
  deactivate(vendor: Vendor): void { if (!window.confirm(`Deactivate ${vendor.name}?`)) return; this.api.deactivateVendor(vendor.id).pipe(tap(() => this.toast.show('Vendor deactivated.', 'success'))).subscribe(() => this.reload()); }
}
