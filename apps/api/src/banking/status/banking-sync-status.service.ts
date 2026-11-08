import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../../persistence/persistence.client";
import { bankingSyncStatus } from "./banking-sync-status";

@Injectable()
export class BankingSyncStatusService {
  constructor(private readonly persistence: PersistenceClient) {}

  async forUser(userId: string, id: string) {
    const facts = await this.persistence
      .user(userId)
      .providerSync.status.query({ id });
    return bankingSyncStatus(facts, new Date());
  }
}
