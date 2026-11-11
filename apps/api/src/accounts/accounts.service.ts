import type { AccountListItem, SetAccountAlias } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class AccountsService {
  constructor(private readonly persistence: PersistenceClient) {}

  getActiveForUser(userId: string): Promise<AccountListItem[]> {
    return this.persistence.user(userId).accounts.listActive.query();
  }

  setAlias(userId: string, input: SetAccountAlias) {
    return this.persistence.user(userId).accounts.setAlias.mutate(input);
  }
}
