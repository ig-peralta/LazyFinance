import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { MockAuthService } from "../auth/mock/mock-auth.service";
import { testMockAuth } from "../auth/testing/mock-auth-fixtures";
import { AccountClient as AccountRepository } from "../persistence/accounts.client";
import { PersistenceClient as ExternalIdentityRepository } from "../persistence/persistence.client";

describe("public accounts.list RPC", () => {
  const demoUser = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "demo@lazyfinance.cl",
    name: "Camila Rojas",
  };
  const accounts = [
    {
      id: "00000000-0000-4000-8000-000000000002",
      alias: "Cuenta corriente",
      type: "checking",
      currency: "CLP",
      balance: "125000.00",
      lastSyncedAt: null,
    },
  ];
  const listActiveForUser = vi.fn(async (userId: string) =>
    userId === demoUser.id ? accounts : [],
  );
  let app: INestApplication;

  beforeEach(async () => {
    listActiveForUser.mockClear();
    const { verifier, resolver } = testMockAuth({
      "demo-token": {
        userId: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
      },
      "other-token": {
        userId: "00000000-0000-4000-8000-000000000003",
        email: "other@lazyfinance.local",
        name: "Otro",
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockAuthService)
      .useValue(verifier)
      .overrideProvider(ExternalIdentityRepository)
      .useValue(resolver)
      .overrideProvider(AccountRepository)
      .useValue({ listActiveForUser })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a valid bearer token", async () => {
    await request(app.getHttpServer()).get("/trpc/accounts.list").expect(401);
    await request(app.getHttpServer())
      .get("/trpc/accounts.list")
      .set("Authorization", "Bearer invalid")
      .expect(401);
    expect(listActiveForUser).not.toHaveBeenCalled();
  });

  it("uses the authenticated principal to list accounts", async () => {
    const response = await request(app.getHttpServer())
      .get("/trpc/accounts.list")
      .set("Authorization", "Bearer demo-token")
      .expect(200);

    expect(response.body.result.data).toEqual(accounts);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(listActiveForUser).toHaveBeenCalledWith(demoUser.id);

    await request(app.getHttpServer())
      .get("/trpc/accounts.list")
      .set("Authorization", "Bearer other-token")
      .expect(200)
      .expect((res) => expect(res.body.result.data).toEqual([]));
    expect(listActiveForUser).toHaveBeenLastCalledWith(
      "00000000-0000-4000-8000-000000000003",
    );
  });
});
