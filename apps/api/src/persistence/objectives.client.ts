import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "./persistence.client";

@Injectable()
export class ObjectiveClient {
  constructor(private readonly persistence: PersistenceClient) {}
  async listForUser(userId: string) {
    return (await this.persistence.user(userId).objectives.list.query()).map(
      (row) => ({
        ...row,
        startDate: row.startDate === null ? null : new Date(row.startDate),
        endDate: row.endDate === null ? null : new Date(row.endDate),
      }),
    );
  }
}
