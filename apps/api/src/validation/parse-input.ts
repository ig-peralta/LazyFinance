import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ message, issues: result.error.issues });

  return result.data;
}
