import {
  DirectFinancialActionSchema,
  type FinancialAction,
  type ReviseFinancialActionSchema,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { PersistenceClient } from "../persistence/persistence.client";
import { actionCommand, actionRequest } from "./action-command";

@Injectable()
export class ActionsService {
  constructor(private readonly persistence: PersistenceClient) {}

  get(userId: string, id: string) {
    return this.persistence.user(userId).financialActions.get.query({ id });
  }

  preview(userId: string, value: unknown) {
    const { action } = actionCommand(value);
    return this.persistence
      .user(userId)
      .financialActions.preview.query({ action });
  }

  prepare(
    userId: string,
    conversationId: string,
    turnId: string,
    value: unknown,
  ) {
    const { action, command } = actionCommand(value);
    return this.persistence.user(userId).financialActions.prepare.mutate({
      conversationId,
      turnId,
      action,
      command,
    });
  }

  async approve(userId: string, input: { id: string; version: number }) {
    const current = await this.get(userId, input.id);
    let command = null;
    try {
      command = actionCommand(current.request).command;
    } catch (error) {
      if (!(error instanceof TRPCError) || error.code !== "BAD_REQUEST")
        throw error;
    }
    return this.persistence
      .user(userId)
      .financialActions.apply.mutate({ ...input, command });
  }

  revise(userId: string, input: z.infer<typeof ReviseFinancialActionSchema>) {
    const { action, command } = actionCommand(input.action);
    return this.persistence.user(userId).financialActions.revise.mutate({
      id: input.id,
      version: input.version,
      action,
      command,
    });
  }

  cancel(userId: string, input: { id: string; version: number }) {
    return this.persistence.user(userId).financialActions.cancel.mutate(input);
  }

  execute(
    userId: string,
    grantId: string,
    clientId: string,
    value: unknown,
  ): Promise<FinancialAction> {
    const input = DirectFinancialActionSchema.parse(value);
    const action = actionRequest(input.action);
    let command = null;
    try {
      command = actionCommand(action).command;
    } catch (error) {
      if (!(error instanceof TRPCError) || error.code !== "BAD_REQUEST")
        throw error;
    }
    return this.persistence.user(userId).financialActions.execute.mutate({
      input: { ...input, action },
      command,
      grantId,
      clientId,
    });
  }
}
