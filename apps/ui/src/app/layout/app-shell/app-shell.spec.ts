import "@angular/compiler";
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "../../core/auth/session.service";
import { OnboardingData } from "../../features/onboarding/onboarding.data";
import { AppShell } from "./app-shell";

@Component({ selector: "tags-stub", template: "<h1>Etiquetas</h1>" })
class TagsStub {}

@Component({
  selector: "objectives-stub",
  template: "<h1>Presupuestos y metas</h1>",
})
class ObjectivesStub {}

@Component({
  selector: "security-stub",
  template: "<h1>Acceso y seguridad</h1>",
})
class SecurityStub {}

@Component({
  selector: "bank-connections-stub",
  template: "<h1>Conexiones bancarias</h1>",
})
class BankConnectionsStub {}

describe("AppShell", () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(failLogout = false) {
    const onboardingStatus = signal<
      "active" | "skipped" | "completed" | undefined
    >("skipped");
    const clear = vi.fn();
    const logout = vi.fn(async () => {
      if (failLogout) throw new Error("Firebase sign-out failed");

      clear();
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: "",
            component: AppShell,
            children: [
              { path: "dashboard", component: TagsStub },
              { path: "etiquetas", component: TagsStub },
              { path: "movimientos", component: TagsStub },
              { path: "movimientos/:id", component: TagsStub },
              { path: "cuentas", component: TagsStub },
              { path: "ingresos", component: TagsStub },
              { path: "ingresos/fuentes", component: TagsStub },
              { path: "presupuestos-y-metas", component: ObjectivesStub },
              {
                path: "presupuestos/:id/movimientos",
                component: ObjectivesStub,
              },
              { path: "metas/:id", component: ObjectivesStub },
              { path: "metas", component: ObjectivesStub },
              { path: "seguridad", component: SecurityStub },
              { path: "conexiones-bancarias", component: BankConnectionsStub },
              { path: "comenzar", component: SecurityStub },
            ],
          },
        ]),
        {
          provide: SessionService,
          useValue: { clear, logout, error: signal(null), retry: vi.fn() },
        },
        { provide: OnboardingData, useValue: { status: onboardingStatus } },
      ],
    });
    const harness = await RouterTestingHarness.create("/etiquetas");
    const root = harness.fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector("dialog") as HTMLDialogElement;
    dialog.showModal = () => {
      dialog.open = true;
    };
    dialog.close = () => {
      dialog.open = false;
    };

    return { harness, clear, logout, root, onboardingStatus };
  }

  it("keeps four primary areas and direct contextual links with an active destination", async () => {
    const { root } = await setup();
    const links = Array.from(
      root.querySelectorAll(
        'nav[aria-label="Navegación principal"] .workspace-links a',
      ),
    );

    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "Resumen",
      "Mi dinero",
      "Planificación",
      "Mi cuenta",
    ]);
    expect(
      links
        .filter((a) => a.getAttribute("aria-current") === "true")
        .map((a) => a.textContent?.trim()),
    ).toEqual(["Mi dinero"]);
    expect(
      root
        .querySelector('.workspace-subnav a[aria-current="page"]')
        ?.textContent?.trim(),
    ).toBe("Etiquetas");
    expect(
      [...root.querySelectorAll(".workspace-subnav a")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["/movimientos", "/cuentas", "/etiquetas"]);
  });

  it("toggles the mobile menu and closes it after navigating", async () => {
    const { harness, root } = await setup();
    const toggle = root.querySelector(
      'button[aria-controls="mobile-menu"]',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    harness.detectChanges();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const mobileLinks = root.querySelectorAll(
      "#mobile-menu .workspace-links a",
    );
    expect([...mobileLinks].map((link) => link.textContent?.trim())).toEqual([
      "Resumen",
      "Mi dinero",
      "Planificación",
      "Mi cuenta",
    ]);

    (
      root.querySelector(
        '#mobile-menu a[href="/presupuestos-y-metas"]',
      ) as HTMLAnchorElement
    ).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector<HTMLDialogElement>("#mobile-menu")?.open).toBe(
      false,
    );
    expect(TestBed.inject(Router).url).toBe("/presupuestos-y-metas");
  });

  it("moves skip-link focus into content without navigating to the public landing", async () => {
    const { root } = await setup();
    const url = TestBed.inject(Router).url;
    root.querySelector<HTMLAnchorElement>(".skip-link")?.click();
    expect(root.ownerDocument.activeElement).toBe(root.querySelector("main"));
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it("dismisses the modal menu on programmatic navigation, not only menu-link clicks", async () => {
    const { harness, root } = await setup();
    root
      .querySelector<HTMLButtonElement>('button[aria-controls="mobile-menu"]')
      ?.click();
    harness.detectChanges();
    expect(root.querySelector<HTMLDialogElement>("#mobile-menu")?.open).toBe(
      true,
    );
    await harness.navigateByUrl("/cuentas");
    harness.detectChanges();
    expect(root.querySelector<HTMLDialogElement>("#mobile-menu")?.open).toBe(
      false,
    );
    expect(
      root
        .querySelector('[aria-controls="mobile-menu"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps nested pages in the correct area and selects only the most specific submenu", async () => {
    const { harness, root } = await setup();
    for (const [path, area, label] of [
      [
        "/presupuestos/example/movimientos?month=2026-11",
        "Planificación",
        "Presupuestos",
      ],
      ["/metas/example", "Planificación", "Metas de ahorro"],
      ["/ingresos/fuentes", "Planificación", "Fuentes de ingreso"],
      ["/movimientos/example", "Mi dinero", "Movimientos"],
      ["/conexiones-bancarias", "Mi cuenta", "Conexiones bancarias"],
      ["/comenzar", "Mi cuenta", "Retomar configuración"],
    ]) {
      await harness.navigateByUrl(path);
      harness.detectChanges();
      const active = root.querySelectorAll(
        '.workspace-sidebar a[aria-current="true"]',
      );
      expect([...active].map((link) => link.textContent?.trim())).toEqual([
        area,
      ]);
      expect(active[0].getAttribute("aria-label")).toBeNull();
      const current = root.querySelectorAll(
        '.workspace-subnav a[aria-current="page"]',
      );
      expect([...current].map((a) => a.textContent?.trim())).toEqual([label]);
    }
  });

  it("offers resumption only while skipped, never a permanent onboarding menu item", async () => {
    const { harness, root, onboardingStatus } = await setup();
    await harness.navigateByUrl("/seguridad");
    harness.detectChanges();
    expect(root.querySelector(".topbar-location")?.textContent).toContain(
      "Mi cuenta",
    );
    expect(root.querySelector("h1")?.textContent).toBe("Acceso y seguridad");
    expect(
      root.querySelector('.workspace-subnav a[href="/comenzar"]')?.textContent,
    ).toContain("Retomar configuración");
    for (const state of ["active", "completed", undefined] as const) {
      onboardingStatus.set(state);
      harness.detectChanges();
      expect(
        root.querySelector('.workspace-subnav a[href="/comenzar"]'),
      ).toBeNull();
      expect(
        [...root.querySelectorAll(".workspace-subnav a")].map((link) =>
          link.getAttribute("href"),
        ),
      ).toEqual(["/seguridad", "/conexiones-bancarias"]);
    }
  });

  it.each([
    "active",
    "skipped",
    "completed",
    undefined,
  ] as const)("keeps bank connection settings reachable with onboarding status %s", async (status) => {
    const { harness, root, onboardingStatus } = await setup();
    onboardingStatus.set(status);
    await harness.navigateByUrl("/seguridad");
    harness.detectChanges();
    root
      .querySelector<HTMLAnchorElement>(
        '.workspace-subnav a[href="/conexiones-bancarias"]',
      )
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe("/conexiones-bancarias");
    expect(root.querySelector("h1")?.textContent).toBe("Conexiones bancarias");
    expect(
      root.querySelector('.workspace-sidebar a[aria-current="true"]')
        ?.textContent,
    ).toContain("Mi cuenta");
    expect(
      root
        .querySelector('.workspace-subnav a[aria-current="page"]')
        ?.getAttribute("href"),
    ).toBe("/conexiones-bancarias");
    expect(
      root.querySelector('.workspace-subnav a[href="/comenzar"]') !== null,
    ).toBe(status === "skipped");
  });

  it("makes every existing workflow reachable through an area and its submenu", async () => {
    const { harness, root } = await setup();
    const destinations = new Set<string>();
    for (const path of [
      "/dashboard",
      "/movimientos",
      "/presupuestos-y-metas",
      "/seguridad",
    ]) {
      await harness.navigateByUrl(path);
      harness.detectChanges();
      destinations.add(path);
      for (const a of root.querySelectorAll<HTMLAnchorElement>(
        ".workspace-subnav a",
      )) {
        destinations.add(a.getAttribute("href") ?? "");
      }
    }
    expect([...destinations].sort()).toEqual([
      "/comenzar",
      "/conexiones-bancarias",
      "/cuentas",
      "/dashboard",
      "/etiquetas",
      "/ingresos",
      "/ingresos/fuentes",
      "/metas",
      "/movimientos",
      "/presupuestos-y-metas",
      "/seguridad",
    ]);
  });

  it("offers logout on desktop and mobile and returns to the landing page", async () => {
    const { harness, clear, logout, root } = await setup();
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigateByUrl")
      .mockResolvedValue(true);
    (
      root.querySelector(
        'button[aria-controls="mobile-menu"]',
      ) as HTMLButtonElement
    ).click();
    harness.detectChanges();

    const logouts = Array.from(root.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "Cerrar sesión",
    );
    expect(logouts).toHaveLength(2);

    logouts[0].click();
    await harness.fixture.whenStable();
    expect(logout).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("hides financial content and reports a failed sign-out", async () => {
    const { harness, root } = await setup(true);
    const logout = Array.from(root.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Cerrar sesión",
    ) as HTMLButtonElement;
    logout.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(root.querySelector("h1")).toBeNull();
  });
});
