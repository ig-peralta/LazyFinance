/** Only a provider interaction identifier may select an MCP connection request. */
export function mcpInteractionId(value: string | null | undefined) {
  return value && /^[A-Za-z0-9_-]{1,256}$/.test(value) ? value : undefined;
}
