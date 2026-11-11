import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantVoiceHttp } from "../../../src/assistant/assistant-voice.http";
import { AssistantVoiceService } from "../../../src/assistant/assistant-voice.service";
import { AuthService } from "../../../src/auth/auth.service";
import { HttpAuthGuard } from "../../../src/auth/http.guard";

describe("first-party voice HTTP authentication and strict transport", () => {
  let app: INestApplication;
  const start = vi.fn(
    async (
      _owner: string,
      _origin: string | undefined,
      _input: unknown,
      _signal: AbortSignal,
    ) => ({
      id: "00000000-0000-4000-8000-000000000009",
      sdp: "v=0\r\nanswer",
      expiresAt: "2026-11-11T00:05:00.000Z",
    }),
  );
  const end = vi.fn(async (_owner: string, _id: string) => {});

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AssistantVoiceHttp],
      providers: [
        { provide: APP_GUARD, useClass: HttpAuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: async (bearer: string | undefined) => {
              if (bearer !== "Bearer accepted")
                throw new UnauthorizedException();
              return { userId: "verified-owner" };
            },
          },
        },
        {
          provide: AssistantVoiceService,
          useValue: { configuration: () => ({ enabled: false }), start, end },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it("rejects anonymous configuration, starts and stops", async () => {
    await request(app.getHttpServer())
      .get("/assistant/voice/configuration")
      .expect(401);
    await request(app.getHttpServer())
      .post("/assistant/voice/sessions")
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post("/assistant/voice/end")
      .send({})
      .expect(401);
    expect(start).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it("uses the accepted owner and no-store responses, never browser owner/configuration overrides", async () => {
    const input = {
      conversationId: "00000000-0000-4000-8000-000000000001",
      sdp: "v=0\r\noffer",
    };
    await request(app.getHttpServer())
      .post("/assistant/voice/sessions")
      .set("authorization", "Bearer accepted")
      .send({ ...input, userId: "foreign", apiKey: "forged" })
      .expect(400);
    expect(start).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer())
      .post("/assistant/voice/sessions")
      .set("authorization", "Bearer accepted")
      .set("origin", "http://localhost:4200")
      .send(input)
      .expect(201);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(start).toHaveBeenCalledWith(
      "verified-owner",
      "http://localhost:4200",
      input,
      expect.any(AbortSignal),
    );
    await request(app.getHttpServer())
      .post("/assistant/voice/end")
      .set("authorization", "Bearer accepted")
      .send({ id: response.body.id, owner: "forged" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/assistant/voice/end")
      .set("authorization", "Bearer accepted")
      .send({ id: response.body.id })
      .expect(201);
    expect(end).toHaveBeenCalledWith("verified-owner", response.body.id);
  });
});
