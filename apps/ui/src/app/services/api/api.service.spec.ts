import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';

describe('ApiService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('requests the principal with the supplied bearer token', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ApiService);
    const backend = TestBed.inject(HttpTestingController);

    const result = firstValueFrom(api.getPrincipal('demo-token'));
    const request = backend.expectOne(`${environment.apiUrl}/auth/principal`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer demo-token');

    const principal = {
      userId: 'demo-user',
      email: 'demo@lazyfinance.local',
      name: 'Camila Rojas',
    };
    request.flush(principal);
    await expect(result).resolves.toEqual(principal);
    backend.verify();
  });
});
