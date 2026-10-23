import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../services/session/session.service';
import { AppShell } from './app-shell';

@Component({ template: '<h1>Etiquetas</h1>' })
class TagsStub {}

@Component({ template: '<h1>Presupuestos y metas</h1>' })
class ObjectivesStub {}

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
              { path: 'dashboard', component: TagsStub },
              { path: 'etiquetas', component: TagsStub },
              { path: 'presupuestos-y-metas', component: ObjectivesStub },
            ],
          },
        ]),
        { provide: SessionService, useValue: { clear } },
      ],
    });
    const harness = await RouterTestingHarness.create('/etiquetas');
    const root = harness.fixture.nativeElement as HTMLElement;
    return { harness, clear, root };
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

  it('offers logout on desktop and mobile and returns to the landing page', async () => {
    const { harness, clear, root } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (root.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement).click();
    harness.detectChanges();

    const logouts = Array.from(root.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Cerrar sesión',
    );
    expect(logouts).toHaveLength(2);

    logouts[0].click();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
