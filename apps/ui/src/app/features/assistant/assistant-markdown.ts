import { Marked, Renderer } from "marked";

const escapeText = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const renderer = new Renderer();
// The model may format text, but cannot create requests, external links or active HTML.
renderer.html = ({ text }) => escapeText(text);
renderer.image = ({ text }) => escapeText(text);
renderer.link = ({ text }) => escapeText(text);
const markdown = new Marked({
  renderer,
  breaks: true,
  gfm: true,
  async: false,
});

export function assistantMarkdown(text: string): string {
  return markdown.parse(text.slice(0, 16000), { async: false });
}
