export function rpcPath(procedure: string, input?: unknown) {
  return `/trpc/${procedure}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
}
