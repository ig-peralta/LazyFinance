import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AccountSummary,
  AuthConfig,
  AuthPrincipal,
  BudgetProgress,
  MonthlyComparison,
  MonthlySummary,
  MockLoginResult,
  ObjectiveSummary,
  RecentTransaction,
  TagDecision,
  TagRuleInput,
  TagSuggestion,
  TagSummary,
} from '@lazyfinance/contracts';
import { API_URL } from '../../tokens/api-url';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL).replace(/\/$/, '');

  getAuthConfig() {
    return this.http.get<AuthConfig>(`${this.apiUrl}/auth/config`);
  }

  loginMock(email: string, password: string) {
    return this.http.post<MockLoginResult>(`${this.apiUrl}/auth/mock/login`, { email, password });
  }

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

  getTags() {
    return this.http.get<TagSummary[]>(`${this.apiUrl}/tags`);
  }

  createTag(name: string) {
    return this.http.post<TagSummary>(`${this.apiUrl}/tags`, { name });
  }

  getTagSuggestions(transactionId: string) {
    return this.http.get<TagSuggestion[]>(`${this.apiUrl}/transactions/${transactionId}/tag-suggestions`);
  }

  setTagDecision(transactionId: string, tagId: string | null) {
    return this.http.put<TagDecision>(`${this.apiUrl}/transactions/${transactionId}/tag`, { tagId });
  }

  resetTagDecision(transactionId: string) {
    return this.http.delete<TagDecision>(`${this.apiUrl}/transactions/${transactionId}/tag-decision`);
  }

  createTagRule(rule: TagRuleInput) {
    return this.http.post<void>(`${this.apiUrl}/tag-rules`, rule);
  }

  getObjectives() {
    return this.http.get<ObjectiveSummary[]>(`${this.apiUrl}/objectives`);
  }

  getMonthlySummary(month: string) {
    return this.http.get<MonthlySummary>(`${this.apiUrl}/summaries/monthly`, { params: { month } });
  }

  getMonthlyComparison(month: string) {
    return this.http.get<MonthlyComparison>(`${this.apiUrl}/summaries/comparison`, {
      params: { month },
    });
  }

  getSpendingProgress(month: string) {
    return this.http.get<BudgetProgress[]>(`${this.apiUrl}/objectives/spending-progress`, {
      params: { month },
    });
  }
}
