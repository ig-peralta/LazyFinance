import { once } from "node:events";
import {
  AssistantVoiceEndSchema,
  AssistantVoiceEventSchema,
  AssistantVoiceOfferSchema,
  AssistantVoiceProblemSchema,
  AssistantVoiceScreenUpdateSchema,
  AssistantVoiceSessionSchema,
} from "@lazyfinance/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AssistantVoiceService } from "./assistant-voice.service";

@Controller("assistant/voice")
export class AssistantVoiceHttp {
  constructor(private readonly voice: AssistantVoiceService) {}

  @Get("configuration")
  configuration(@Res({ passthrough: true }) res: Response) {
    res.set("Cache-Control", "private, no-store");
    return this.voice.configuration();
  }

  @Post("sessions")
  async start(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = AssistantVoiceOfferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid voice offer");
    res.set("Cache-Control", "private, no-store");
    const lifetime = new AbortController();
    const close = () => lifetime.abort();
    res.on("close", close);
    try {
      return AssistantVoiceSessionSchema.parse(
        await this.voice.start(
          req.principal.userId,
          req.headers.origin,
          parsed.data,
          lifetime.signal,
        ),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        const problem = AssistantVoiceProblemSchema.safeParse(
          error.getResponse(),
        );
        if (problem.success && problem.data.retryAfterSeconds)
          res.set("Retry-After", String(problem.data.retryAfterSeconds));
      }
      throw error;
    } finally {
      res.off("close", close);
    }
  }

  @Post("end")
  async end(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = AssistantVoiceEndSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid voice session");
    res.set("Cache-Control", "private, no-store");
    await this.voice.end(req.principal.userId, parsed.data.id);
    return { requested: true };
  }

  @Post("events")
  async events(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const parsed = AssistantVoiceEndSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid voice session");
    const lifetime = new AbortController();
    const close = () => lifetime.abort();
    res.on("close", close);
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(305_000),
    ]);
    try {
      await this.voice.listen(
        req.principal.userId,
        parsed.data.id,
        signal,
        async (event) => {
          signal.throwIfAborted();
          if (!res.headersSent) {
            res.status(200).set({
              "Content-Type": "application/x-ndjson; charset=utf-8",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "X-Accel-Buffering": "no",
            });
            res.flushHeaders();
          }
          if (
            !res.write(
              `${JSON.stringify(AssistantVoiceEventSchema.parse(event))}\n`,
            )
          )
            await once(res, "drain", { signal });
        },
      );
    } finally {
      res.off("close", close);
      if (res.headersSent && !res.destroyed) res.end();
    }
  }

  @Post("screen")
  async screen(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = AssistantVoiceScreenUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid screen state");
    res.set("Cache-Control", "private, no-store");
    await this.voice.selectScreen(
      req.principal.userId,
      parsed.data.id,
      parsed.data.selection,
    );
    return { selected: true };
  }
}
