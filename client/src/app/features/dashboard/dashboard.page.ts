import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
@Component({ imports: [RouterLink], templateUrl: './dashboard.page.html', styleUrl: './dashboard.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class DashboardPage { readonly auth = inject(AuthService); }
