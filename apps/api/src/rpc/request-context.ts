import { AsyncLocalStorage } from "node:async_hooks";

const requests = new AsyncLocalStorage<{ requestId: string }>();
export const currentRequestId = () => requests.getStore()?.requestId;
export function withApiRequest<T>(
  requestId: string,
  operation: () => Promise<T>,
) {
  return requests.run({ requestId }, operation);
}
