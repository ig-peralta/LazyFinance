import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../services/session/session.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
})
export class AppShell {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly links = [
    { path: '/dashboard', label: 'Resumen', description: 'Ir al resumen de tus finanzas' },
    { path: '/etiquetas', label: 'Etiquetas', description: 'Ir a la gestión de etiquetas' },
    {
      path: '/presupuestos-y-metas',
      label: 'Presupuestos y metas',
      description: 'Ir a presupuestos y metas',
    },
  ] as const;

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/');
  }
}
