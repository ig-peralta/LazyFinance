import { readFileSync } from "node:fs";
import path from "node:path";
import { RpcEmptySchema, RpcVoidSchema } from "@lazyfinance/contracts";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import {
  type INestApplication,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { AppRouterHost, Query, Router } from "nestjs-trpc";
import request from "supertest";
import { afterAll, beforeAll, expect, expectTypeOf, it } from "vitest";
import { AccountsService } from "../accounts/accounts.service";
import { AppModule } from "../app.module";
import { AuthService } from "../auth/auth.service";
import { PersistenceClient } from "../persistence/persistence.client";

@Router({ alias: "policyProbe" })
class PolicyProbe {
  @Query({ input: RpcEmptySchema, output: RpcVoidSchema })
  missingMeta() {
    throw new Error("must not run");
  }
  @Query({
    input: RpcEmptySchema,
    output: RpcVoidSchema,
    meta: { auth: "public" },
  })
  unapprovedPublic() {
    throw new Error("must not run");
  }
}

let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
    providers: [PolicyProbe],
  })
    .overrideProvider(PersistenceClient)
    .useValue({})
    .overrideProvider(AuthService)
    .useValue({
      authenticate: async () => ({
        userId: "00000000-0000-4000-8000-000000000001",
        email: "owner@example.test",
        name: "Owner",
      }),
      config: () => ({ provider: "mock" }),
    })
    .overrideProvider(AccountsService)
    .useValue({
      getActiveForUser: () => {
        throw new ServiceUnavailableException("Persistence is unavailable");
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  await app.init();
});
afterAll(async () => app?.close());

it("denies absent metadata and unapproved anonymous procedures", async () => {
  for (const method of ["missingMeta", "unapprovedPublic"])
    await request(app.getHttpServer())
      .get(`/trpc/policyProbe.${method}`)
      .expect(403);
});
it("rejects owner injection, hides private procedures and returns sanitized unavailability without a stack", async () => {
  await request(app.getHttpServer())
    .get("/trpc/accounts.list")
    .query({ input: JSON.stringify({ userId: "foreign" }) })
    .expect(400);
  await request(app.getHttpServer())
    .get("/trpc/providerSync.begin")
    .expect(404);
  const response = await request(app.getHttpServer())
    .get("/trpc/accounts.list")
    .expect(503);
  expect(response.body.error.data.code).toBe("SERVICE_UNAVAILABLE");
  expect(response.body.error.data).not.toHaveProperty("stack");
  expect(JSON.stringify(response.body)).not.toMatch(
    /postgres|select |private key/i,
  );
});
it("matches the committed public generated procedure surface at runtime", () => {
  const generated = readFileSync(
    path.join(
      path.dirname(require.resolve("@lazyfinance/rpc-api")),
      "../src/generated/server.ts",
    ),
    "utf8",
  );
  let group = "";
  const expected: string[] = [];
  for (const line of generated.split("\n")) {
    group = /^ {2}(\w+): t\.router/.exec(line)?.[1] ?? group;
    const procedure = /^ {4}(\w+): publicProcedure/.exec(line)?.[1];
    if (procedure) expected.push(`${group}.${procedure}`);
  }
  const procedures = app.get(AppRouterHost).appRouter._def.procedures;
  expect(
    Object.keys(procedures)
      .filter((name) => !name.startsWith("policyProbe."))
      .sort(),
  ).toEqual(expected.sort());
  expect(expected).toHaveLength(33);
});
it("exports precise types and rejects owner input/nonexistent procedures at compile time", () => {
  type Input = inferRouterInputs<ApiRouter>;
  type Output = inferRouterOutputs<ApiRouter>;
  expectTypeOf<Output["accounts"]["list"][number]["balance"]>().toEqualTypeOf<
    string | null
  >();
  expectTypeOf<
    Output["income"]["summary"]["receivedIncome"]
  >().toEqualTypeOf<string>();
  const invalid: Input["income"]["confirm"] = {
    transactionId: "id",
    sourceId: "id",
    // @ts-expect-error No caller-proposed user scope in public contracts.
    userId: "foreign",
  };
  // @ts-expect-error The public API cannot access private persistence commands.
  type _PrivateProcedure = Input["providerSync"];
  void invalid;
});
