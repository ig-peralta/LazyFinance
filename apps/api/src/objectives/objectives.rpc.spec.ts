import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rpcPath } from "../../test/rpc";
import { AppModule } from "../app.module";
import { MockAuthService } from "../auth/mock/mock-auth.service";
import { testMockAuth } from "../auth/testing/mock-auth-fixtures";
import { PersistenceClient as ExternalIdentityRepository } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";

describe("public objectives RPC", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const items = [
    {
      id: "00000000-0000-4000-8000-000000000041",
      name: "Supermercado",
      amount: "280000.00",
      kind: "time_based",
      intent: "spending",
      isRecurring: true,
      period: "monthly",
      startDate: "2024-01-01T15:00:00.000Z",
      endDate: null,
      tags: [],
    },
  ];
  const getForUser = vi.fn(async (id: string) => (id === userId ? items : []));
  const getSpendingProgressForUser = vi.fn(async () => []);
  let app: INestApplication;

  beforeEach(async () => {
    getForUser.mockClear();
    getSpendingProgressForUser.mockClear();
    const { verifier, resolver } = testMockAuth({
      "demo-token": {
        userId,
        email: "demo@lazyfinance.cl",
        name: "Camila Rojas",
      },
      "other-token": {
        userId: "00000000-0000-4000-8000-000000000002",
        email: "other@lazyfinance.local",
        name: "Otro",
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockAuthService)
      .useValue(verifier)
      .overrideProvider(ExternalIdentityRepository)
      .useValue(resolver)
      .overrideProvider(ObjectivesService)
      .useValue({ getForUser, getSpendingProgressForUser })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it("requires authentication before looking up objectives", async () => {
    await request(app.getHttpServer()).get("/trpc/objectives.list").expect(401);
    expect(getForUser).not.toHaveBeenCalled();
  });

  it("returns only objectives belonging to the authenticated user", async () => {
    const response = await request(app.getHttpServer())
      .get("/trpc/objectives.list")
      .set("Authorization", "Bearer demo-token")
      .expect(200);
    expect(response.body.result.data).toEqual(items);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(getForUser).toHaveBeenCalledWith(userId);

    await request(app.getHttpServer())
      .get("/trpc/objectives.list")
      .set("Authorization", "Bearer other-token")
      .expect(200)
      .expect((res) => expect(res.body.result.data).toEqual([]));
    expect(getForUser).toHaveBeenLastCalledWith(
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("validates and scopes spending progress requests", async () => {
    await request(app.getHttpServer())
      .get(rpcPath("objectives.progress", { month: "2026-09" }))
      .expect(401);
    await request(app.getHttpServer())
      .get(rpcPath("objectives.progress", { month: "2026-13" }))
      .set("Authorization", "Bearer demo-token")
      .expect(400);
    await request(app.getHttpServer())
      .get(rpcPath("objectives.progress", { month: "9999-12" }))
      .set("Authorization", "Bearer demo-token")
      .expect(400);
    const response = await request(app.getHttpServer())
      .get(rpcPath("objectives.progress", { month: "2026-09" }))
      .set("Authorization", "Bearer demo-token")
      .expect(200)
      .expect((res) => expect(res.body.result.data).toEqual([]));
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(getSpendingProgressForUser).toHaveBeenCalledWith(userId, "2026-09");
  });
});
