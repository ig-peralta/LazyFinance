import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "./persistence.client";

@Injectable()
export class AccountClient {
  constructor(private readonly persistence: PersistenceClient) {}

  async listActiveForUser(userId: string) {
    return (
      await this.persistence.user(userId).accounts.listActive.query()
    ).map((row) => ({
      ...row,
      lastSyncedAt:
        row.lastSyncedAt === null ? null : new Date(row.lastSyncedAt),
    }));
  }
}
