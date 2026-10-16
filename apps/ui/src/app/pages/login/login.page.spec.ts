import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../services/session/session.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('logs in as the demo user and can clear the session', async () => {
    const principal = {
      userId: 'demo-user',
      email: 'demo@lazyfinance.local',
      name: 'Camila Rojas',
    };
    const active = signal(false);
    const user = signal<typeof principal | null>(null);
    const loginWithToken = vi.fn(async () => {
      user.set(principal);
      active.set(true);
      return principal;
    });
    const clear = vi.fn(() => {
      user.set(null);
      active.set(false);
    });

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { active, user, loginWithToken, clear } },
      ],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('#email') as HTMLInputElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('#password') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (fixture.nativeElement.querySelector('[data-testid="email-login"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (fixture.nativeElement.querySelector('[data-testid="google-login"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const demoButton = fixture.nativeElement.querySelector(
      '[data-testid="demo-login"]',
    ) as HTMLButtonElement;
    expect(demoButton.disabled).toBe(false);
    demoButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginWithToken).toHaveBeenCalledWith('lazyfinance-demo-token');
    expect(fixture.nativeElement.textContent).toContain(principal.name);

    (fixture.nativeElement.querySelector('[data-testid="logout"]') as HTMLButtonElement).click();
    expect(clear).toHaveBeenCalledOnce();
  });
});
