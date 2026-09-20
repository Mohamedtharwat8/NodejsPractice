import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
function positive(control: AbstractControl): ValidationErrors | null { return Number(control.value) > 0 ? null : { positive: true }; }
function itemGroup() { return new FormGroup({ description: new FormControl('', { nonNullable: true, validators: [Validators.required] }), quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, positive] }), unitPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, positive] }) }); }
@Component({ imports: [CurrencyPipe, ReactiveFormsModule, RouterLink], templateUrl: './request-form.page.html', styleUrl: './request-form.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class RequestFormPage {
  private readonly api = inject(ApiService); private readonly router = inject(Router);
  readonly saving = signal(false); readonly drafting = signal(false); readonly error = signal(''); readonly revision = signal(0);
  readonly form = new FormGroup({ title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(4)] }), justification: new FormControl('', { nonNullable: true }), items: new FormArray([itemGroup()]) });
  readonly total = computed(() => { this.revision(); return this.items.controls.reduce((sum, item) => sum + Number(item.controls.quantity.value || 0) * Number(item.controls.unitPrice.value || 0), 0); });
  get items() { return this.form.controls.items; }
  addItem(): void { this.items.push(itemGroup()); this.touchTotal(); }
  removeItem(index: number): void { if (this.items.length > 1) this.items.removeAt(index); this.touchTotal(); }
  touchTotal(): void { this.revision.update((value) => value + 1); }
  draft(): void { if (!this.form.controls.title.value || this.items.invalid) return; this.drafting.set(true); this.api.draftJustification({ title: this.form.controls.title.value, items: this.items.getRawValue() }).subscribe({ next: ({ justification }) => { this.form.controls.justification.setValue(justification); this.drafting.set(false); }, error: () => { this.error.set('AI drafting is unavailable. You can continue by writing the justification yourself.'); this.drafting.set(false); } }); }
  save(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.saving.set(true); this.error.set(''); this.api.createRequest(this.form.getRawValue()).subscribe({ next: () => void this.router.navigateByUrl('/requests'), error: () => { this.saving.set(false); this.error.set('The request could not be saved. Check the API and try again.'); } }); }
}
