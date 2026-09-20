import { Pipe, PipeTransform } from '@angular/core';
import { PurchaseRequest, RequestStatus } from '../../core/models';
@Pipe({ name: 'statusCount', standalone: true })
export class StatusCountPipe implements PipeTransform { transform(requests: PurchaseRequest[], status: RequestStatus): number { return requests.filter((request) => request.status === status).length; } }
