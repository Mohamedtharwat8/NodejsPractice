import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest, debounceTime, distinctUntilChanged, map, startWith } from 'rxjs';
import { RequestStatus } from '../../core/models';
import { RequestStore } from '../../core/request.store';

@Component({ imports: [AsyncPipe, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink], templateUrl: './request-list.page.html', styleUrl: './request-list.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class RequestListPage implements OnInit {
  private readonly store = inject(RequestStore);
  readonly search = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<RequestStatus | ''>('', { nonNullable: true });
  readonly state$ = combineLatest([
    this.store.state$,
    this.search.valueChanges.pipe(startWith(''), debounceTime(250), distinctUntilChanged()),
  ]).pipe(map(([state, query]) => ({ ...state, data: state.data.filter((request) => `${request.title} ${request.id}`.toLowerCase().includes(query.trim().toLowerCase())) })));
  ngOnInit(): void { this.store.load(); }
  filter(): void { this.store.load(this.status.value || undefined); }
}
