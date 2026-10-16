import '@angular/compiler';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { SessionService } from '../services/session/session.service';
import { apiInterceptor } from './api.interceptor';

describe('API authorization interceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { token: () => 'demo-token' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('sends the session token only to the API', () => {
    http.get(`${environment.apiUrl}/accounts`).subscribe();
    http.get('https://another.example/accounts').subscribe();
    http.get(`${environment.apiUrl}.evil.example/accounts`).subscribe();

    const apiRequest = backend.expectOne(`${environment.apiUrl}/accounts`);
    expect(apiRequest.request.headers.get('Authorization')).toBe('Bearer demo-token');
    apiRequest.flush({});

    for (const url of [
      'https://another.example/accounts',
      `${environment.apiUrl}.evil.example/accounts`,
    ]) {
      const other = backend.expectOne(url);
      expect(other.request.headers.has('Authorization')).toBe(false);
      other.flush({});
    }
  });

  it('preserves an explicitly provided Authorization header', () => {
    http
      .get(`${environment.apiUrl}/accounts`, {
        headers: { Authorization: 'Bearer another-token' },
      })
      .subscribe();

    const request = backend.expectOne(`${environment.apiUrl}/accounts`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer another-token');
    request.flush({});
  });
});
