import "reflect-metadata";
import type { Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AccountRepository } from "../finance/account/account.repository";
import { AccountRpc } from "../finance/account/account.rpc";
import { AccountService } from "../finance/account/account.service";
import { IncomeExpectationRepository } from "../finance/income-expectation/income-expectation.repository";
import { IncomeExpectationRpc } from "../finance/income-expectation/income-expectation.rpc";
import { IncomeReceiptRepository } from "../finance/income-receipt/income-receipt.repository";
import { IncomeReceiptRpc } from "../finance/income-receipt/income-receipt.rpc";
import { IncomeSourceRepository } from "../finance/income-source/income-source.repository";
import { IncomeSourceRpc } from "../finance/income-source/income-source.rpc";
import { ObjectiveRepository } from "../finance/objective/objective.repository";
import { ObjectiveRpc } from "../finance/objective/objective.rpc";
import { ProviderConnectionRepository } from "../finance/provider-connection/provider-connection.repository";
import { ProviderConnectionRpc } from "../finance/provider-connection/provider-connection.rpc";
import { TagRepository } from "../finance/tag/tag.repository";
import { TagRpc } from "../finance/tag/tag.rpc";
import { TagRuleRepository } from "../finance/tag-rule/tag-rule.repository";
import { TagRuleRpc } from "../finance/tag-rule/tag-rule.rpc";
import { TransactionRepository } from "../finance/transaction/transaction.repository";
import { TransactionRpc } from "../finance/transaction/transaction.rpc";
import { ExternalIdentityRepository } from "../identity/external-identity/external-identity.repository";
import { ExternalIdentityRpc } from "../identity/external-identity/external-identity.rpc";
import { RlsMiddleware } from "../rpc/rls.middleware";
import { RLS_DB, RUNTIME_DB } from "./tokens";

interface Binding {
  property: string;
  token: Type<unknown> | symbol;
}

interface InjectionCase {
  router: Type<object>;
  bindings: Binding[];
}

const cases: InjectionCase[] = [
  {
    router: AccountRpc,
    bindings: [{ property: "service", token: AccountService }],
  },
  {
    router: IncomeExpectationRpc,
    bindings: [{ property: "repository", token: IncomeExpectationRepository }],
  },
  {
    router: IncomeReceiptRpc,
    bindings: [{ property: "repository", token: IncomeReceiptRepository }],
  },
  {
    router: IncomeSourceRpc,
    bindings: [
      { property: "repository", token: IncomeSourceRepository },
      { property: "transactions", token: TransactionRepository },
    ],
  },
  {
    router: ObjectiveRpc,
    bindings: [{ property: "repository", token: ObjectiveRepository }],
  },
  {
    router: ProviderConnectionRpc,
    bindings: [{ property: "repository", token: ProviderConnectionRepository }],
  },
  {
    router: TagRpc,
    bindings: [{ property: "repository", token: TagRepository }],
  },
  {
    router: TagRuleRpc,
    bindings: [{ property: "repository", token: TagRuleRepository }],
  },
  {
    router: TransactionRpc,
    bindings: [{ property: "repository", token: TransactionRepository }],
  },
  {
    router: ExternalIdentityRpc,
    bindings: [{ property: "repository", token: ExternalIdentityRepository }],
  },
];

async function expectInjections(target: Type<object>, bindings: Binding[]) {
  const instances = new Map(bindings.map(({ token }) => [token, {}]));
  // Stub database/service tokens without opening a pool or starting a server.
  const module = await Test.createTestingModule({
    providers: [
      target,
      ...bindings.map(({ token }) => ({
        provide: token,
        useValue: instances.get(token),
      })),
    ],
  }).compile();

  try {
    const instance = module.get(target);

    for (const { property, token } of bindings) {
      expect(Reflect.get(instance, property)).toBe(instances.get(token));
    }
  } finally {
    await module.close();
  }
}

describe("private RPC constructor injection", () => {
  it.each(cases)("resolves $router.name from its constructor types", async ({
    router,
    bindings,
  }) => {
    expect(Reflect.getMetadata("design:paramtypes", router)).toEqual(
      bindings.map(({ token }) => token),
    );

    await expectInjections(router, bindings);
  });

  it("keeps the scoped database proxy on its explicit symbol token", async () => {
    await expectInjections(AccountRepository, [
      { property: "db", token: RLS_DB },
    ]);
  });

  it("keeps middleware infrastructure on its explicit runtime database token", async () => {
    await expectInjections(RlsMiddleware, [
      { property: "database", token: RUNTIME_DB },
    ]);
  });
});
