import type { AccountSummary } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class AccountsService {
  constructor(private readonly persistence: PersistenceClient) {}

  getActiveForUser(userId: string): Promise<AccountSummary[]> {
    return this.persistence.user(userId).accounts.listActive.query();
  }
}
