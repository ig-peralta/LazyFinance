import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { TRPCClientError } from "@trpc/client";

export function persistenceException(
  error: unknown,
): HttpException | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;

  const status: number | undefined = error.data?.httpStatus;

  return status && [400, 401, 403, 404, 409, 413, 429].includes(status)
    ? new HttpException(error.message, status)
    : new ServiceUnavailableException("Persistence is unavailable");
}
