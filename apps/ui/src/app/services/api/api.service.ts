import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AccountSummary,
  AuthPrincipal,
  ObjectiveSummary,
  RecentTransaction,
} from '@lazyfinance/contracts';
import { API_URL } from '../../tokens/api-url';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL).replace(/\/$/, '');

  getPrincipal(token: string) {
    return this.http.get<AuthPrincipal>(`${this.apiUrl}/auth/principal`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  getAccounts() {
    return this.http.get<AccountSummary[]>(`${this.apiUrl}/accounts`);
  }

  getRecentTransactions() {
    return this.http.get<RecentTransaction[]>(`${this.apiUrl}/transactions/recent`);
  }

  getObjectives() {
    return this.http.get<ObjectiveSummary[]>(`${this.apiUrl}/objectives`);
  }
}
