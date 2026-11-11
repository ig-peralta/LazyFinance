import type { SetAccountAlias } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { wireValue } from "../../serialization";
import { AccountRepository } from "./account.repository";

@Injectable()
export class AccountService {
  constructor(private readonly repository: AccountRepository) {}

  async listActive() {
    return (await this.repository.listActive()).map((row) => ({
      ...row,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    }));
  }

  async setAlias(input: SetAccountAlias) {
    return wireValue(await this.repository.setAlias(input));
  }
}
