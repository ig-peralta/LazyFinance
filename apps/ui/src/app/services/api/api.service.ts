import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { SessionUser } from '../session/session.types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getPrincipal(token: string) {
    return this.http.get<SessionUser>(`${environment.apiUrl}/auth/principal`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
