import {
  type DecideAssistantConsent,
  DecideAssistantConsentSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { StoredAssistantConsentSchema } from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { AssistantConsentRepository } from "./assistant-consent.repository";

@Router({ alias: "assistantConsent" })
export class AssistantConsentRpc {
  constructor(private readonly repository: AssistantConsentRepository) {}

  @Query({
    input: RpcEmptySchema,
    output: StoredAssistantConsentSchema.nullable(),
    meta: { context: "user" },
  })
  get() {
    return this.repository.get();
  }

  @Mutation({
    input: DecideAssistantConsentSchema,
    output: StoredAssistantConsentSchema,
    meta: { context: "user" },
  })
  decide(@Input() input: DecideAssistantConsent) {
    return this.repository.decide(input);
  }
}
