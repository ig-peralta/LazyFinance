import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AuthPrincipal } from '@lazyfinance/contracts';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getPrincipal(token: string) {
    return this.http.get<AuthPrincipal>(`${environment.apiUrl}/auth/principal`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
