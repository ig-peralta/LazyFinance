import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MCP_STRATEGY, McpStrategy } from "@rekog/mcp-nest";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { AppModule } from "../../../src/app.module";
import { mockIdentity } from "../../../src/auth/mock/mock-auth.constants";
import { EnvironmentService } from "../../../src/environment/environment.service";
import { PersistenceClient } from "../../../src/persistence/persistence.client";
import { testEnvironment } from "../../fixtures/environment";

const demoToken = "lazyfinance-demo-token";

const initialization = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "auth-test", version: "1.0.0" },
  },
};

describe("MCP HTTP authentication without OAuth configuration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnvironmentService)
      .useValue(testEnvironment())
      .overrideProvider(PersistenceClient)
      .useValue({
        resolveExisting: async (identity: typeof mockIdentity) => {
          if (identity.providerSubject !== mockIdentity.providerSubject)
            throw new UnauthorizedException();

          return {
            userId: "00000000-0000-4000-8000-000000000001",
            email: "demo@lazyfinance.cl",
            name: "Camila Rojas",
          };
        },
      })
      .compile();

    app = module.createNestApplication();
    const strategy = app.get<McpStrategy>(MCP_STRATEGY);
    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated requests on every MCP HTTP verb", async () => {
    await request(app.getHttpServer())
      .post("/mcp")
      .send(initialization)
      .expect(401);
    await request(app.getHttpServer()).get("/mcp").expect(401);
    await request(app.getHttpServer()).delete("/mcp").expect(401);
  });

  it("rejects an unknown bearer token", async () => {
    await request(app.getHttpServer())
      .post("/mcp")
      .set("Authorization", "Bearer unknown-token")
      .send(initialization)
      .expect(401);
  });

  it("does not treat application/development bearer identity as an external MCP grant", async () => {
    await request(app.getHttpServer())
      .post("/mcp")
      .set("Authorization", `Bearer ${demoToken}`)
      .set("Accept", "application/json, text/event-stream")
      .send(initialization)
      .expect(401);
    await request(app.getHttpServer())
      .get("/trpc/auth.principal")
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(200);
  });
});
