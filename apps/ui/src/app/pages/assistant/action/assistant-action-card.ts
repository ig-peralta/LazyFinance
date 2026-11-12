import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import type { FinancialAction } from "@lazyfinance/contracts";
import { RpcClient, type RpcScope } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { latestAssistantAction } from "../../../features/assistant/assistant-action-state";
import {
  type ActionFields,
  actionDetails,
  actionFields,
  actionLabels,
  editedAction,
} from "./action-presentation";

@Component({
  selector: "assistant-action-card",
  imports: [FormsModule, RouterLink],
  templateUrl: "./assistant-action-card.html",
  styleUrl: "./assistant-action-card.css",
})
export class AssistantActionCard {
  readonly action = input.required<FinancialAction>();
  readonly approvableTurn = input(false);
  readonly interruptedVoiceTurn = input(false);
  readonly busy = input(false);
  readonly changed = output<FinancialAction>();
  private readonly rpc = inject(RpcClient);
  private readonly replacement = signal<{
    scope: RpcScope;
    action: FinancialAction;
  } | null>(null);
  private readonly uncertain = signal<{ scope: RpcScope; id: string } | null>(
    null,
  );
  protected readonly editing = signal(false);
  private readonly editingVersion = signal<number | undefined>(undefined);
  protected readonly outdatedEdit = computed(
    () => this.editing() && this.editingVersion() !== this.current().version,
  );
  protected readonly fields = signal<ActionFields | null>(null);
  protected readonly invalid = signal(false);
  protected readonly clock = signal(Date.now());
  protected readonly command = createScopedCommand(() => this.action().id);
  protected readonly current = computed(() => {
    const value = this.replacement();
    return value &&
      value.scope === this.rpc.authenticatedScope() &&
      value.action.id === this.action().id
      ? latestAssistantAction(this.action(), value.action)
      : this.action();
  });
  protected readonly needsReconciliation = computed(
    () =>
      this.uncertain()?.scope === this.rpc.authenticatedScope() &&
      this.uncertain()?.id === this.action().id,
  );
  protected readonly expired = computed(
    () =>
      this.current().status === "expired" ||
      (["proposed", "stale"].includes(this.current().status) &&
        Date.parse(this.current().expiresAt) <= this.clock()),
  );
  protected readonly mutable = computed(
    () =>
      this.approvableTurn() &&
      !this.busy() &&
      !this.command.pending() &&
      !this.needsReconciliation() &&
      ["proposed", "stale", "expired"].includes(this.current().status),
  );
  protected readonly label = computed(
    () => actionLabels[this.current().request.kind],
  );
  protected readonly details = computed(() => actionDetails(this.current()));
  protected readonly objective = computed(() =>
    ["create_budget", "create_savings_goal"].includes(
      this.current().request.kind,
    ),
  );
  protected readonly newTags = computed(() => {
    const fields = this.fields();
    return fields
      ? [
          ...new Set(
            fields.newTags
              .split("\n")
              .map((name) => name.trim())
              .filter(Boolean),
          ),
        ].map((name) => ({ name, color: fields.newTagColors[name] ?? null }))
      : [];
  });
  protected readonly tagEditor = computed(() =>
    ["create_tag", "update_tag"].includes(this.current().request.kind),
  );
  protected readonly tags = resource({
    params: () =>
      this.editing() &&
      (this.objective() || this.current().request.kind === "tag_movement")
        ? this.rpc.authenticatedScope()
        : undefined,
    loader: ({ params, abortSignal }) =>
      params.client.tags.list.query(undefined, { signal: abortSignal }),
  });
  protected readonly status = computed(() =>
    this.current().status === "applied"
      ? "Cambio confirmado"
      : this.current().status === "cancelled"
        ? "Cancelada"
        : this.expired()
          ? "Propuesta vencida"
          : this.current().status === "stale"
            ? "Necesita revisión"
            : "Pendiente de tu aprobación",
  );

  constructor() {
    effect((onCleanup) => {
      const expires = Date.parse(this.current().expiresAt);
      this.clock.set(Date.now());
      const timer = setTimeout(
        () => this.clock.set(Date.now()),
        Math.max(0, Math.min(expires - Date.now() + 5, 2147483647)),
      );
      onCleanup(() => clearTimeout(timer));
    });
    let owner: RpcScope | undefined;
    effect(() => {
      const scope = this.rpc.authenticatedScope();
      if (scope !== owner) {
        this.editing.set(false);
        this.fields.set(null);
        this.invalid.set(false);
      }
      owner = scope;
    });
  }

  protected field<K extends keyof ActionFields>(
    key: K,
    value: ActionFields[K],
  ) {
    this.fields.update((fields) => {
      if (!fields) return fields;
      if (key === "newTags" && typeof value === "string") {
        const before = fields.newTags
          .split("\n")
          .map((name) => name.trim())
          .filter(Boolean);
        const names = value
          .split("\n")
          .map((name) => name.trim())
          .filter(Boolean);
        const newTagColors = Object.fromEntries(
          names.map((name, index) => [
            name,
            Object.hasOwn(fields.newTagColors, name)
              ? fields.newTagColors[name]
              : (fields.newTagColors[before[index]] ?? null),
          ]),
        );
        return { ...fields, [key]: value, newTagColors };
      }
      return { ...fields, [key]: value };
    });
  }

  protected toggleTag(id: string) {
    const fields = this.fields();
    if (fields)
      this.field(
        "tagIds",
        fields.tagIds.includes(id)
          ? fields.tagIds.filter((value) => value !== id)
          : [...fields.tagIds, id],
      );
  }

  protected newTagColor(name: string, color: string | null) {
    const fields = this.fields();
    if (fields)
      this.field("newTagColors", { ...fields.newTagColors, [name]: color });
  }

  protected edit() {
    if (this.mutable()) {
      this.fields.set(actionFields(this.current()));
      this.editingVersion.set(this.current().version);
      this.invalid.set(false);
      this.editing.set(true);
    }
  }

  private accept(value: FinancialAction, scope: RpcScope) {
    this.replacement.set({ scope, action: value });
    this.editing.set(false);
    this.changed.emit(value);
  }

  private async run(
    kind: "approve" | "cancel" | "revise",
    request?: FinancialAction["request"],
  ) {
    const action = this.current(),
      scope = this.rpc.authenticatedScope();
    if (
      !scope ||
      !this.mutable() ||
      (kind === "approve" && (this.expired() || action.status !== "proposed"))
    )
      return;
    const input = { id: action.id, version: action.version };
    const saved = await this.command.run(
      (current, signal) =>
        kind === "revise" && request
          ? current.client.financialActions.revise.mutate(
              { ...input, action: request },
              { signal },
            )
          : kind === "approve"
            ? current.client.financialActions.approve.mutate(input, { signal })
            : current.client.financialActions.cancel.mutate(input, { signal }),
      (value) => this.accept(value, scope),
      "Estado de la propuesta confirmado.",
    );
    if (!saved && !scope.signal.aborted)
      this.uncertain.set({ scope, id: action.id });
  }

  protected approve() {
    return this.run("approve");
  }
  protected cancel() {
    return this.run("cancel");
  }
  protected async save() {
    const fields = this.fields();
    if (!fields || this.outdatedEdit()) return;
    const parsed = editedAction(this.current(), fields);
    this.invalid.set(!parsed.success);
    if (parsed.success) await this.run("revise", parsed.data);
  }

  protected async reconcile() {
    const scope = this.rpc.authenticatedScope(),
      id = this.current().id;
    if (!scope || this.command.pending()) return;
    await this.command.run(
      (current, signal) =>
        current.client.financialActions.get.query({ id }, { signal }),
      (value) => {
        this.uncertain.set(null);
        this.accept(value, scope);
      },
      "Estado consultado.",
    );
  }
}
