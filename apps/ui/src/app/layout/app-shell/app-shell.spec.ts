import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../services/session/session.service';
import { TagsPage } from '../../pages/tags/tags.page';
import { ObjectivesPage } from '../../pages/objectives/objectives.page';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup() {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: AppShell,
            children: [
              { path: 'dashboard', component: TagsPage },
              { path: 'etiquetas', component: TagsPage },
              { path: 'presupuestos-y-metas', component: ObjectivesPage },
            ],
          },
        ]),
        { provide: SessionService, useValue: { clear } },
      ],
    });
    const harness = await RouterTestingHarness.create('/etiquetas');
    return { harness, clear, root: harness.routeNativeElement?.closest('app-shell') as HTMLElement };
  }

  it('links to the three destinations and marks the active one', async () => {
    const { root } = await setup();
    const links = Array.from(root.querySelectorAll('nav[aria-label="Navegación principal"] a'));

    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Resumen',
      'Etiquetas',
      'Presupuestos y metas',
    ]);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
  });

  it('shows the active placeholder page heading', async () => {
    const { harness, root } = await setup();
    expect(root.querySelector('h1')?.textContent).toContain('Etiquetas');

    await harness.navigateByUrl('/presupuestos-y-metas');
    expect(root.querySelector('h1')?.textContent).toContain('Presupuestos y metas');
  });

  it('toggles the mobile menu and closes it after navigating', async () => {
    const { harness, root } = await setup();
    const toggle = root.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    harness.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const mobileLinks = root.querySelectorAll('#mobile-menu a');
    expect(mobileLinks).toHaveLength(3);

    (mobileLinks[2] as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector('#mobile-menu')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/presupuestos-y-metas');
  });

  it('clears the session and returns to the landing page on logout', async () => {
    const { harness, clear, root } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const logout = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cerrar sesión',
    ) as HTMLButtonElement;
    logout.click();
    harness.detectChanges();

    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
