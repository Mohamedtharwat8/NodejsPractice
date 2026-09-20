import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ToastComponent } from '../core/toast.component';
@Component({ imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastComponent], templateUrl: './shell.component.html', styleUrl: './shell.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class ShellComponent {
  readonly auth = inject(AuthService); readonly menuOpen = signal(false);
  readonly initials = computed(() => this.auth.user()?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('') || 'PP');
}
