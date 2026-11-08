import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** Presentation only. Keep the static first paint in index.html aligned. */
@Component({
  selector: "workspace-loading",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="workspace-loading">
      <section class="workspace-loading-content" aria-label="LazyFinance">
        <svg class="workspace-loading-logo" width="64" height="64" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="currentColor" /><path d="m10 26 8-8 5 5 9-12m-8 0h8v8" fill="none" stroke="#05251b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <strong class="workspace-loading-brand">LazyFinance<span>.</span></strong>
        <div class="workspace-loading-message"><ng-content /></div>
        @if (busy()) { <div class="workspace-loading-progress" aria-hidden="true"><span></span></div> }
      </section>
      <p class="workspace-loading-footnote">Tus finanzas, con calma y claridad.</p>
    </main>
  `,
})
export class WorkspaceLoading {
  readonly busy = input(true);
}
