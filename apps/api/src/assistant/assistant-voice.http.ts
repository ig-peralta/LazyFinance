import {
  AssistantVoiceEndSchema,
  AssistantVoiceOfferSchema,
  AssistantVoiceSessionSchema,
} from "@lazyfinance/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
}
