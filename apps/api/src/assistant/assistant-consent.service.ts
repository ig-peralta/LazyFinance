import { createHash } from "node:crypto";
import {
  ASSISTANT_CONSENT_POLICY_VERSION,
  AssistantConsentStateSchema,
  type DecideAssistantConsent,
} from "@lazyfinance/contracts";
import type { StoredAssistantConsent } from "@lazyfinance/contracts/internal";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { EnvironmentService } from "../environment/environment.service";
import { PersistenceClient } from "../persistence/persistence.client";

@Injectable()
export class AssistantConsentService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly environment: EnvironmentService,
  ) {}

  private policy() {
    const provider = this.environment.get("ASSISTANT_PROVIDER");
    const model = this.environment.get("ASSISTANT_MODEL") ?? "";
    const endpoint =
      provider === "openai-compatible"
        ? new URL(this.environment.get("ASSISTANT_BASE_URL") ?? "").href
        : null;
    const version = ASSISTANT_CONSENT_POLICY_VERSION;
    const key = createHash("sha256")
      .update(
        JSON.stringify({ policyVersion: version, provider, model, endpoint }),
      )
      .digest("hex");
    return {
      key,
      version,
      provider,
      model,
      endpoint: endpoint ? new URL(endpoint).origin : null,
    };
  }

  private required() {
    const provider = this.environment.get("ASSISTANT_PROVIDER");
    return provider !== "disabled" && provider !== "demo";
  }

  private project(stored: StoredAssistantConsent | null) {
    const policy = this.policy();
    const current = stored?.policyKey === policy.key ? stored : null;
    return AssistantConsentStateSchema.parse({
      required: this.required(),
      policy,
      decision: current?.decision ?? "unset",
      revision: stored?.revision ?? 0,
      decidedAt: current?.decidedAt ?? null,
    });
  }

  async state(owner: string) {
    return this.project(
      this.required()
        ? await this.persistence.user(owner).assistantConsent.get.query()
        : null,
    );
  }

  async decide(owner: string, input: DecideAssistantConsent) {
    if (!this.required())
      throw new ForbiddenException("External processing is not enabled");
    if (input.policyKey !== this.policy().key)
      throw new ConflictException("Assistant policy changed");
    return this.project(
      await this.persistence.user(owner).assistantConsent.decide.mutate(input),
    );
  }

  async requireAccepted(owner: string) {
    const state = await this.state(owner);
    if (state.required && state.decision !== "accepted")
      throw new ForbiddenException(
        "Assistant external-processing consent required",
      );
  }
}
