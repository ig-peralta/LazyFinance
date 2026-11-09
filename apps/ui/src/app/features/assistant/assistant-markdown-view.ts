import { Component, computed, input, ViewEncapsulation } from "@angular/core";
import { assistantMarkdown } from "./assistant-markdown";

/** Tag-scoped styles cover generated markup; Angular still sanitizes the HTML. */
@Component({
  selector: "assistant-markdown",
  encapsulation: ViewEncapsulation.None,
  template: '<div [innerHTML]="html()"></div>',
  styles: `
    assistant-markdown { display: block; min-width: 0; overflow-wrap: anywhere; }
    assistant-markdown :is(h1,h2,h3,h4,h5,h6) { font-size: 16px; color: #e0eee4; line-height: 1.5; margin: 18px 0 10px; }
    assistant-markdown :is(p,ul,ol,blockquote,pre,table) { margin: 0 0 14px; }
    assistant-markdown :is(ul,ol) { padding-left: 22px; }
    assistant-markdown :is(pre,table) { display: block; max-width: 100%; overflow: auto; }
    assistant-markdown pre { white-space: pre; background: #070f0a77; padding: 12px; border-radius: 8px; }
    assistant-markdown code { font-size: 11px; }
    assistant-markdown :not(pre)>code { background: #ffffff07; border-radius: 4px; padding: 2px 5px; }
    assistant-markdown strong { color: #e2eee6; font-weight: 600; }
    assistant-markdown :is(th,td) { padding: 8px 12px; border-bottom: 1px solid #ffffff12; text-align: left; }
    assistant-markdown blockquote { border-left: 2px solid #6ee7b740; padding-left: 14px; }
  `,
})
export class AssistantMarkdownView {
  readonly text = input.required<string>();
  protected readonly html = computed(() => assistantMarkdown(this.text()));
}
