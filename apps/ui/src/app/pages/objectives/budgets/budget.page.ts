import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { reportWorkspaceReadiness } from "../../../core/rendering/workspace-preparation";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { createCursorTrail } from "../../../features/pagination/cursor-trail";
import { EditorDrawer } from "../../../shared/ui/editor-drawer";
import { Icon } from "../../../shared/ui/icon";
import { budgetEditPolicy } from "./budget-edit-policy";
import { BudgetEditor } from "./budget-editor/budget-editor";

@Component({
  selector: "budget-page",
  imports: [RouterLink, Icon, BudgetEditor, EditorDrawer],
  templateUrl: "./budget.page.html",
})
export class BudgetPage {
  private readonly rpc = inject(RpcClient);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly selection = computed(() => {
    const scope = this.rpc.authenticatedScope(),
      id = this.params().get("id");
    return scope && id ? { scope, id } : undefined;
  });
  protected readonly detail = resource({
    params: this.selection,
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.objectives.budget.query({ id }, { signal: abortSignal }),
  });
  protected readonly showHistory = signal(false);
  protected readonly editPolicy = computed(() =>
    budgetEditPolicy(this.detail.hasValue() ? this.detail.value() : null),
  );
  protected readonly historyTrail = createCursorTrail(this.selection);
  protected readonly history = resource({
    params: () => {
      const selection = this.selection();
      return selection && this.showHistory()
        ? { ...selection, cursor: this.historyTrail.entry() }
        : undefined;
    },
    loader: ({ params: { scope, id, cursor }, abortSignal }) =>
      scope.client.objectives.budgetHistory.query(
        { id, cursor, limit: 10 },
        { signal: abortSignal },
      ),
  });
  protected readonly command = createScopedCommand(this.selection);
  protected readonly archiving = signal(false);
  protected readonly editorOpen = signal(false);
  private readonly notice = signal<{ key: unknown; message: string } | null>(
    null,
  );
  protected readonly message = computed(() =>
    this.notice()?.key === this.selection() ? this.notice()?.message : null,
  );
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
    reportWorkspaceReadiness(this.detail);
    effect(() => {
      this.selection();
      this.archiving.set(false);
      this.showHistory.set(false);
      this.editorOpen.set(false);
    });
  }

  protected saved() {
    this.editorOpen.set(false);
    this.notice.set({
      key: this.selection(),
      message:
        "Revisión guardada. Revisa su fecha de vigencia; el período en curso no se reescribe.",
    });
    this.detail.reload();
    this.historyTrail.reset();
    this.history.reload();
  }

  protected archive() {
    if (!this.detail.hasValue()) return;
    const detail = this.detail.value(),
      selection = this.selection();
    void this.command.run(
      (scope, signal) =>
        scope.client.objectives.archiveBudget.mutate(
          { id: detail.id, expectedVersion: detail.version },
          { signal },
        ),
      () => {
        if (selection !== this.selection()) return;
        this.archiving.set(false);
        this.notice.set({
          key: selection,
          message:
            "Presupuesto archivado. Sus compras anteriores aún pueden reconciliarse con correcciones y devoluciones.",
        });
        this.detail.reload();
        this.historyTrail.reset();
        this.history.reload();
      },
    );
  }

  protected nextHistory() {
    if (this.history.hasValue() && !this.history.isLoading()) {
      const cursor = this.history.value().pageInfo.nextCursor;
      if (cursor) this.historyTrail.next(cursor);
    }
  }
}
