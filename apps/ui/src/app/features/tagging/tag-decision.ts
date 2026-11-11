import { isPlatformBrowser } from "@angular/common";
import {
  computed,
  DestroyRef,
  inject,
  PendingTasks,
  PLATFORM_ID,
  resource,
  type Signal,
  signal,
} from "@angular/core";
import type { RecentTransaction, TagSummary } from "@lazyfinance/contracts";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { isCancelled, isUnauthorized } from "../../core/rpc/rpc-error";
import { type TagDecisionOutcome, TaggingData } from "./tagging.data";

/** Component-lifetime state for one transaction's commands and suggestions. */
export function createTagDecision(transaction: Signal<RecentTransaction>) {
  const rpc = inject(RpcClient);
  const tagging = inject(TaggingData);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const pendingTasks = inject(PendingTasks);
  const lifetime = new AbortController();
  inject(DestroyRef).onDestroy(() => lifetime.abort());

  const command = signal<
    | {
        scope: RpcScope;
        transactionId: string;
        pending: boolean;
        needsCheck: boolean;
        error: string | null;
      }
    | undefined
  >(undefined);
  const current = computed(() => {
    const state = command();
    return state?.scope === rpc.authenticatedScope() &&
      state?.transactionId === transaction().id
      ? state
      : undefined;
  });

  const suggestions = resource({
    params: () => {
      const scope = rpc.authenticatedScope();
      const movement = transaction();

      return browser &&
        scope &&
        !movement.tag &&
        movement.tagDecisionOrigin === "unreviewed"
        ? { scope, id: movement.id }
        : undefined;
    },
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.tags.suggestions.query({ id }, { signal: abortSignal }),
    defaultValue: [],
  });

  async function execute(
    operation: (movement: RecentTransaction) => Promise<TagDecisionOutcome>,
    reconcile = false,
  ): Promise<boolean> {
    if (current()?.pending || (current()?.needsCheck && !reconcile))
      return false;

    const scope = rpc.authenticatedScope();
    if (!scope) return false;

    const movement = transaction();
    const state = {
      scope,
      transactionId: movement.id,
      pending: true,
      needsCheck: false,
      error: null,
    };
    command.set(state);
    const finished = pendingTasks.add();

    try {
      const result = await operation(movement);
      if (
        command() !== state ||
        scope.signal.aborted ||
        lifetime.signal.aborted ||
        movement.id !== transaction().id
      )
        return false;

      command.set({ ...state, pending: false, error: result.warning });

      return true;
    } catch (error) {
      if (command() !== state) return false;

      if (
        !isCancelled(error) &&
        !isUnauthorized(error) &&
        !scope.signal.aborted &&
        !lifetime.signal.aborted
      ) {
        command.set({
          ...state,
          pending: false,
          needsCheck: true,
          error:
            "No pudimos confirmar todos los cambios. Comprueba el movimiento antes de volver a guardar; una etiqueta nueva puede haberse creado sin quedar asignada.",
        });
      } else if (command() === state) {
        command.set(undefined);
      }

      return false;
    } finally {
      finished();
    }
  }

  return {
    saving: computed(() => current()?.pending ?? false),
    needsCheck: computed(() => current()?.needsCheck ?? false),
    reconcile: () =>
      execute(
        (movement) => tagging.reconcile(movement.id, lifetime.signal),
        true,
      ),
    error: computed(() => current()?.error ?? null),
    suggestion: computed(() =>
      suggestions.hasValue() ? (suggestions.value()[0] ?? null) : null,
    ),
    clearError: () =>
      command.update((state) =>
        state?.error ? { ...state, error: null } : state,
      ),
    choose: (tag: TagSummary | null, autoApply: boolean) =>
      execute((movement) =>
        tagging.choose(movement, tag, autoApply, lifetime.signal),
      ),
    createAndChoose: (name: string, autoApply: boolean) =>
      execute((movement) =>
        tagging.createAndChoose(movement, name, autoApply, lifetime.signal),
      ),
    reset: () =>
      execute((movement) => tagging.reset(movement, lifetime.signal)),
  };
}
