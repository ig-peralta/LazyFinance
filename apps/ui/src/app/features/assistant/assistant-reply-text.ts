/** Keep model-generated citation noise out of prose; references have their own cards. */
export function assistantReplyText(text: string, streaming = false): string {
  const visible = text
    .replace(/[ \t]*\[F\d+(?:\s*[,;]\s*F\d+)*\]/g, "")
    .replace(/[ \t]*\[F[\d,; F]*$/, "");
  // A citation can arrive as "[", "F", "1", "]" in separate stream chunks.
  return (streaming ? visible.replace(/[ \t]*\[$/, "") : visible).trim();
}
