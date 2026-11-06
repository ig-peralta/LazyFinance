import "reflect-metadata";
import type { Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AccountsRpc } from "../accounts/accounts.rpc";
import { AccountsService } from "../accounts/accounts.service";
import { AuthRpc } from "../auth/auth.rpc";
import { AuthService } from "../auth/auth.service";
import { IncomeRpc } from "../income/income.rpc";
import { IncomeService } from "../income/income.service";
import { ObjectivesRpc } from "../objectives/objectives.rpc";
import { ObjectivesService } from "../objectives/objectives.service";
import { SummariesRpc } from "../summaries/summaries.rpc";
import { SummariesService } from "../summaries/summaries.service";
import { TagRulesRpc, TagsRpc } from "../transactions/tagging/tagging.rpc";
import { TaggingService } from "../transactions/tagging/tagging.service";
import { TransactionsRpc } from "../transactions/transactions.rpc";
import { TransactionsService } from "../transactions/transactions.service";

interface InjectionCase {
  router: Type<object>;
  service: Type<unknown>;
  property: string;
}

const cases: InjectionCase[] = [
  { router: AccountsRpc, service: AccountsService, property: "service" },
  { router: AuthRpc, service: AuthService, property: "auth" },
  { router: IncomeRpc, service: IncomeService, property: "service" },
  { router: ObjectivesRpc, service: ObjectivesService, property: "service" },
  { router: SummariesRpc, service: SummariesService, property: "service" },
  { router: TagsRpc, service: TaggingService, property: "service" },
  { router: TagRulesRpc, service: TaggingService, property: "service" },
  {
    router: TransactionsRpc,
    service: TransactionsService,
    property: "service",
  },
];

describe("public RPC constructor injection", () => {
  it.each(cases)("resolves $router.name from its constructor type", async ({
    router,
    service,
    property,
  }) => {
    const instance = {};
    // Compile only: no application initialization, HTTP listener or upstream.
    const module = await Test.createTestingModule({
      providers: [router, { provide: service, useValue: instance }],
    }).compile();

    try {
      expect(Reflect.getMetadata("design:paramtypes", router)).toEqual([
        service,
      ]);
      expect(Reflect.get(module.get(router), property)).toBe(instance);
    } finally {
      await module.close();
    }
  });
});
