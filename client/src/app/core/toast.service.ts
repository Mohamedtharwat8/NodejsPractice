import { Injectable, signal } from '@angular/core';
export interface Toast { id: number; kind: 'success' | 'error' | 'info'; message: string; }
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly messages = signal<Toast[]>([]);
  show(message: string, kind: Toast['kind'] = 'info'): void { const id = this.nextId++; this.messages.update((items) => [...items, { id, kind, message }]); window.setTimeout(() => this.dismiss(id), 4500); }
  dismiss(id: number): void { this.messages.update((items) => items.filter((item) => item.id !== id)); }
}
