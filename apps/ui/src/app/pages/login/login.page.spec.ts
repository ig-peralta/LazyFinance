import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api/api.service';
import { SessionService } from '../../services/session/session.service';
import { LoginPage } from './login.page';

const principal = {
  userId: 'demo-user',
  email: 'demo@lazyfinance.cl',
  name: 'Camila Rojas',
};

function setup(provider: 'firebase' | 'mock' = 'mock', failConfig = false, activeSession = false, redirect?: string) {
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
  const logout = vi.fn(async () => clear());
  const loginWithGoogle = vi.fn(async () => {
    user.set(principal);
    active.set(true);
    return principal;
  });
  const getAuthConfig = vi.fn(() => failConfig
    ? throwError(() => new Error('offline'))
    : of({ provider }));
  const loginMock = vi.fn(() => of({ token: 'mock-session-token' }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(redirect ? { redirect } : {}) } } },
      { provide: SessionService, useValue: { active, user, loginWithToken, loginWithGoogle, clear, logout } },
      { provide: ApiService, useValue: { getAuthConfig, loginMock } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  return { fixture, active, user, loginWithToken, loginWithGoogle, clear, logout, getAuthConfig, loginMock, navigate };
}

describe('LoginPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows mock credentials only in mock mode and logs in using the returned token', async () => {
    const { fixture, loginMock, loginWithToken, navigate, clear, logout } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    expect(email.disabled).toBe(false);
    expect(password.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="google-login"]')).toBeNull();

    password.value = 'password';
    (fixture.nativeElement.querySelector('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginMock).toHaveBeenCalledWith(email.value, 'password');
    expect(loginWithToken).toHaveBeenCalledExactlyOnceWith('mock-session-token');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    expect(fixture.nativeElement.textContent).toContain(principal.name);

    (fixture.nativeElement.querySelector('[data-testid="logout"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(logout).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('shows Google sign-in instead of mock credentials when Firebase is configured', async () => {
    const { fixture, loginMock, loginWithToken, loginWithGoogle, navigate } = setup('firebase');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#email')).toBeNull();
    expect(fixture.nativeElement.querySelector('#password')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="mock-login"]')).toBeNull();
    const google = fixture.nativeElement.querySelector('[data-testid="google-login"]') as HTMLButtonElement;
    expect(google.disabled).toBe(false);
    await fixture.componentInstance.loginWithMock('demo@lazyfinance.cl', 'password');
    expect(loginMock).not.toHaveBeenCalled();
    expect(loginWithToken).not.toHaveBeenCalled();
    google.click();
    await fixture.whenStable();
    expect(loginWithGoogle).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('preserves a restored Firebase session on the login page', async () => {
    const { fixture, clear } = setup('firebase', false, true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(clear).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(principal.name);
  });

  it('returns a restored Firebase user to a protected deep link', async () => {
    const { fixture, navigate } = setup('firebase', false, true, '/etiquetas');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/etiquetas');
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
