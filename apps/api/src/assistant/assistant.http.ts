import { once } from "node:events";
import {
  AssistantEventSchema,
  AssistantSendSchema,
} from "@lazyfinance/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AssistantService } from "./assistant.service";

@Controller("assistant")
export class AssistantHttp {
  constructor(private readonly assistant: AssistantService) {}

  @Post("turns")
  async turn(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const parsed = AssistantSendSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Invalid assistant message");
    const lifetime = new AbortController();
    const close = () => lifetime.abort();
    res.on("close", close);
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(65_000),
    ]);
    try {
      await this.assistant.stream(
        req.principal.userId,
        parsed.data,
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
            !res.write(`${JSON.stringify(AssistantEventSchema.parse(event))}\n`)
          )
            await once(res, "drain", { signal });
        },
      );
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof HttpException) throw error;
        const failure = z
          .object({ data: z.object({ code: z.string() }) })
          .safeParse(error);
        const code = failure.success ? failure.data.data.code : "";
        const status =
          code === "NOT_FOUND"
            ? 404
            : code === "CONFLICT"
              ? 409
              : code === "TOO_MANY_REQUESTS"
                ? 429
                : 503;
        throw new HttpException(
          "No pudimos iniciar esta respuesta. Revisa la conversación y su estado antes de volver a enviarla.",
          status,
        );
      }
      if (!signal.aborted && !res.destroyed)
        res.write(
          `${JSON.stringify({ type: "error", message: "No se confirmó el resultado. Consulta el historial antes de volver a enviar el mensaje." })}\n`,
        );
    } finally {
      res.off("close", close);
      if (res.headersSent && !res.destroyed) res.end();
    }
  }
}
