import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, finalize, of } from 'rxjs';
import { ApiService } from './api.service';
import { PurchaseRequest, RequestStatus } from './models';

interface RequestState { data: PurchaseRequest[]; loading: boolean; error: boolean; status?: RequestStatus; }
@Injectable({ providedIn: 'root' })
export class RequestStore {
  private readonly api = inject(ApiService);
  private readonly subject = new BehaviorSubject<RequestState>({ data: [], loading: false, error: false });
  readonly state$ = this.subject.asObservable();
  load(status?: RequestStatus): void {
    this.subject.next({ ...this.subject.value, loading: true, error: false, status });
    this.api.listRequests(status).pipe(catchError(() => { this.subject.next({ data: [], loading: false, error: true, status }); return of(null); }), finalize(() => { if (this.subject.value.loading) this.subject.next({ ...this.subject.value, loading: false }); })).subscribe((page) => { if (page) this.subject.next({ data: page.data, loading: false, error: false, status }); });
  }
  update(request: PurchaseRequest): void { this.subject.next({ ...this.subject.value, data: this.subject.value.data.map((item) => item.id === request.id ? request : item) }); }
}
