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
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { currentMonth } from "../../../../utils/month";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { SavingsMeasure } from "../../../features/objectives/savings-measure";
import { createCursorTrail } from "../../../features/pagination/cursor-trail";
import { EditorDrawer } from "../../../shared/ui/editor-drawer";
import { Icon } from "../../../shared/ui/icon";
import { objectivePeriod } from "../forms/objective-form";
import { SavingsEditor } from "./savings-editor/savings-editor";

@Component({
  selector: "savings-goal-page",
  imports: [RouterLink, Icon, SavingsEditor, SavingsMeasure, EditorDrawer],
  templateUrl: "./savings-goal.page.html",
})
export class SavingsGoalPage {
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
  protected readonly goal = resource({
    params: this.selection,
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.objectives.savingsGoal.query(
        { id },
        { signal: abortSignal },
      ),
  });
  protected readonly command = createScopedCommand(this.selection);
  protected readonly showHistory = signal(false);
  protected readonly trail = createCursorTrail(this.selection);
  protected readonly history = resource({
    params: () => {
      const selection = this.selection();
      return selection && this.showHistory()
        ? { ...selection, cursor: this.trail.entry() }
        : undefined;
    },
    loader: ({ params: { scope, id, cursor }, abortSignal }) =>
      scope.client.objectives.savingsGoalHistory.query(
        { id, cursor, limit: 10 },
        { signal: abortSignal },
      ),
  });
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
  protected readonly period = objectivePeriod;
  protected readonly month = signal(currentMonth());
  protected readonly maxMonth = currentMonth();

  protected selectMonth(value: string) {
    if (MonthSchema.safeParse(value).success && value <= this.maxMonth)
      this.month.set(value);
  }

  constructor() {
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
        "Meta actualizada. Su vista actual se restablece con la nueva configuración; el historial se conserva.",
    });
    this.goal.reload();
    this.trail.reset();
    this.history.reload();
  }

  protected archive() {
    if (!this.goal.hasValue()) return;
    const goal = this.goal.value(),
      selection = this.selection();
    void this.command.run(
      (scope, signal) =>
        scope.client.objectives.archiveSavingsGoal.mutate(
          { id: goal.id, expectedVersion: goal.version },
          { signal },
        ),
      () => {
        if (selection !== this.selection()) return;
        this.archiving.set(false);
        this.notice.set({
          key: selection,
          message:
            "Meta archivada. Su configuración y las asignaciones anteriores al corte siguen siendo consultables.",
        });
        this.goal.reload();
        this.trail.reset();
        this.history.reload();
      },
    );
  }

  protected nextHistory() {
    if (this.history.hasValue() && !this.history.isLoading()) {
      const cursor = this.history.value().pageInfo.nextCursor;
      if (cursor) this.trail.next(cursor);
    }
  }
}
