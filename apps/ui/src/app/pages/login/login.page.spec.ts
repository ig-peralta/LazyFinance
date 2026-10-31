import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api/api.service';
import { SessionService } from '../../services/session/session.service';
import { LoginPage } from './login.page';

const principal = {
  userId: 'demo-user',
  email: 'demo@lazyfinance.local',
  name: 'Camila Rojas',
};

function setup(provider: 'firebase' | 'mock' = 'mock', failConfig = false, activeSession = false) {
  const active = signal(activeSession);
  const user = signal<typeof principal | null>(activeSession ? principal : null);
  const loginWithToken = vi.fn(async () => {
    user.set(principal);
    active.set(true);
    return principal;
  });
  const clear = vi.fn(() => {
    user.set(null);
    active.set(false);
  });
  const getAuthConfig = vi.fn(() => failConfig
    ? throwError(() => new Error('offline'))
    : of({ provider }));
  const loginMock = vi.fn(() => of({ token: 'mock-session-token' }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SessionService, useValue: { active, user, loginWithToken, clear } },
      { provide: ApiService, useValue: { getAuthConfig, loginMock } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  return { fixture, active, user, loginWithToken, clear, getAuthConfig, loginMock, navigate };
}

describe('LoginPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows mock credentials only in mock mode and logs in using the returned token', async () => {
    const { fixture, loginMock, loginWithToken, navigate, clear } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    expect(email.disabled).toBe(false);
    expect(password.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="google-login"]')).toBeNull();

    password.value = 'lazyfinance-local-password';
    (fixture.nativeElement.querySelector('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginMock).toHaveBeenCalledWith(email.value, 'lazyfinance-local-password');
    expect(loginWithToken).toHaveBeenCalledExactlyOnceWith('mock-session-token');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    expect(fixture.nativeElement.textContent).toContain(principal.name);

    (fixture.nativeElement.querySelector('[data-testid="logout"]') as HTMLButtonElement).click();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('hides mock credentials when Firebase is configured', async () => {
    const { fixture, loginMock, loginWithToken, clear } = setup('firebase', false, true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#email')).toBeNull();
    expect(fixture.nativeElement.querySelector('#password')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="mock-login"]')).toBeNull();
    expect((fixture.nativeElement.querySelector('[data-testid="google-login"]') as HTMLButtonElement).disabled)
      .toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    await fixture.componentInstance.loginWithMock('demo@lazyfinance.local', 'lazyfinance-local-password');
    expect(loginMock).not.toHaveBeenCalled();
    expect(loginWithToken).not.toHaveBeenCalled();
  });

  it('does not establish a session when mock login is rejected', async () => {
    const { fixture, loginMock, loginWithToken } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    loginMock.mockImplementationOnce(() => throwError(() => new Error('invalid credentials')));

    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    password.value = 'wrong';
    (fixture.nativeElement.querySelector('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginWithToken).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('does not render mock inputs when provider discovery fails', async () => {
    const { fixture } = setup('mock', true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#email')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });
});
