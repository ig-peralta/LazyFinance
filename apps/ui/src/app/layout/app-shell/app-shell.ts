import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { Icon } from "../../shared/ui/icon";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgTemplateOutlet, Icon],
  templateUrl: "./app-shell.html",
})
export class AppShell {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly credentials = inject(AuthCredentials);
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>("menuDialog");
  protected readonly person = computed(
    () => this.credentials.current()?.principal.name ?? "Tu espacio",
  );
  protected readonly initials = computed(() =>
    this.person()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join(""),
  );

  protected readonly menuOpen = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  protected readonly links = [
    {
      path: "/dashboard",
      icon: "overview",
      label: "Resumen",
      description: "Ir al resumen de tus finanzas",
    },
    {
      path: "/etiquetas",
      icon: "tag",
      label: "Etiquetas",
      description: "Ir a la gestión de etiquetas",
    },
    {
      path: "/movimientos",
      icon: "activity",
      label: "Movimientos",
      description: "Explorar el historial de movimientos",
    },
    {
      path: "/ingresos/fuentes",
      icon: "income",
      label: "Ingresos",
      description: "Planificar tus fuentes de ingreso",
    },
    {
      path: "/presupuestos-y-metas",
      icon: "target",
      label: "Presupuestos y metas",
      description: "Ir a presupuestos y metas",
    },
    {
      path: "/seguridad",
      icon: "security",
      label: "Acceso y seguridad",
      description: "Gestionar métodos de acceso",
    },
  ] as const;

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    this.menuOpen.set(true);
    this.dialog()?.nativeElement.showModal();
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected async logout(): Promise<void> {
    this.logoutError.set(null);

    try {
      await this.session.logout();
      await this.router.navigateByUrl("/");
    } catch {
      this.logoutError.set(
        "No se pudo cerrar la sesión completamente. Inténtalo de nuevo.",
      );
    }
  }
}
