import { RpcIdSchema } from "@lazyfinance/contracts";
import {
  type AcquireProviderRequest,
  AcquireProviderRequestSchema,
  ClaimProviderScheduleSchema,
  DeferProviderRequestsSchema,
  ProviderRequestPermitSchema,
  ProviderRequestReleasedSchema,
  ProviderScheduleClaimSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Router } from "nestjs-trpc";
import { ProviderRequestRepository } from "./provider-request.repository";
import { ProviderScheduleRepository } from "./provider-schedule.repository";

@Router({ alias: "providerScheduler" })
export class ProviderSchedulerRpc {
  constructor(private readonly repository: ProviderScheduleRepository) {}

  @Mutation({
    input: ClaimProviderScheduleSchema,
    output: ProviderScheduleClaimSchema.nullable(),
    meta: { context: "banking-scheduler" },
  })
  claim(@Input() input: { mode: "test" | "live" }) {
    return this.repository.claim(input.mode);
  }
}

@Router({ alias: "providerRequests" })
export class ProviderRequestsRpc {
  constructor(private readonly repository: ProviderRequestRepository) {}

  @Mutation({
    input: AcquireProviderRequestSchema,
    output: ProviderRequestPermitSchema,
    meta: { context: "banking-transport" },
  })
  acquire(@Input() input: AcquireProviderRequest) {
    return this.repository.acquire(input);
  }

  @Mutation({
    input: RpcIdSchema,
    output: ProviderRequestReleasedSchema,
    meta: { context: "banking-transport" },
  })
  release(@Input() input: { id: string }) {
    return this.repository.release(input.id);
  }

  @Mutation({
    input: DeferProviderRequestsSchema,
    output: ProviderRequestReleasedSchema,
    meta: { context: "banking-transport" },
  })
  defer(@Input() input: { mode: "test" | "live"; retryAfter: string }) {
    return this.repository.defer(input.mode, input.retryAfter);
  }
}
