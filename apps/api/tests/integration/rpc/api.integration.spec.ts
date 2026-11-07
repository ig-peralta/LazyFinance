import { RpcEmptySchema, RpcVoidSchema } from "@lazyfinance/contracts";
import {
  type INestApplication,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Query, Router } from "nestjs-trpc";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AccountsService } from "../../../src/accounts/accounts.service";
import { AppModule } from "../../../src/app.module";
import { AuthService } from "../../../src/auth/auth.service";
import { PersistenceClient } from "../../../src/persistence/persistence.client";

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
