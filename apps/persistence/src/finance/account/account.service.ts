import { Injectable } from "@nestjs/common";
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
}
