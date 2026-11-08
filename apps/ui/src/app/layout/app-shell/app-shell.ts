import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { Router, RouterLink, RouterOutlet } from "@angular/router";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { Icon } from "../../shared/ui/icon";

@Component({
  selector: "app-shell",
  imports: [RouterLink, RouterOutlet, NgTemplateOutlet, Icon],
  templateUrl: "./app-shell.html",
})
export class AppShell {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly credentials = inject(AuthCredentials);
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>("menuDialog");
  private readonly content = viewChild<ElementRef<HTMLElement>>("content");
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
      path: "/cuentas",
      icon: "bank",
      label: "Cuentas",
      description: "Consultar cuentas y sincronización informada",
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
      path: "/ingresos",
      icon: "income",
      label: "Ingresos",
      description: "Planificar tus fuentes de ingreso",
    },
    {
      path: "/presupuestos-y-metas",
      icon: "wallet",
      label: "Presupuestos",
      description: "Ir a presupuestos y metas",
    },
    {
      path: "/metas",
      icon: "target",
      label: "Metas de ahorro",
      description: "Revisar metas y asignaciones registradas",
    },
    {
      path: "/seguridad",
      icon: "security",
      label: "Acceso y seguridad",
      description: "Gestionar métodos de acceso",
    },
    {
      path: "/comenzar",
      icon: "spark",
      label: "Primeros pasos",
      description: "Configurar tu espacio a tu ritmo",
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

  protected active(path: string): boolean {
    const current = this.router.url.split(/[?#]/, 1)[0];
    return (
      current === path ||
      current.startsWith(`${path}/`) ||
      (path === "/presupuestos-y-metas" && current.startsWith("/presupuestos/"))
    );
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.content()?.nativeElement.focus();
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
