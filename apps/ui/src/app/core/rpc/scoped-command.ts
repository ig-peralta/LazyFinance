import {
  computed,
  DestroyRef,
  inject,
  PendingTasks,
  signal,
} from "@angular/core";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import { TRPCClientError } from "@trpc/client";
import { RpcClient, type RpcScope } from "./rpc-client";
import { isCancelled, isUnauthorized } from "./rpc-error";

/** One component's explicit writes. Cancellation never claims a server rollback. */
export function createScopedCommand() {
  const rpc = inject(RpcClient),
    tasks = inject(PendingTasks),
    lifetime = new AbortController();
  inject(DestroyRef).onDestroy(() => lifetime.abort());
  const state = signal<
    | {
        scope: RpcScope;
        pending: boolean;
        error: string | null;
        success: string | null;
      }
    | undefined
  >(undefined);
  const current = computed(() =>
    state()?.scope === rpc.authenticatedScope() ? state() : undefined,
  );

  async function run<Result>(
    operation: (scope: RpcScope, signal: AbortSignal) => Promise<Result>,
    saved: (result: Result) => void = () => {},
    message = "Cambios guardados.",
  ): Promise<boolean> {
    const scope = rpc.authenticatedScope();
    if (!scope || current()?.pending || lifetime.signal.aborted) return false;
    const execution = { scope, pending: true, error: null, success: null };
    state.set(execution);
    const finish = tasks.add();
    try {
      const result = await operation(scope, lifetime.signal);
      if (
        state() !== execution ||
        scope.signal.aborted ||
        lifetime.signal.aborted ||
        rpc.authenticatedScope() !== scope
      )
        return false;
      saved(result);
      state.set({ ...execution, pending: false, success: message });
      return true;
    } catch (error) {
      if (state() !== execution) return false;
      if (
        scope.signal.aborted ||
        lifetime.signal.aborted ||
        isCancelled(error) ||
        isUnauthorized(error)
      ) {
        state.set(undefined);
        return false;
      }
      const code =
        error instanceof TRPCClientError
          ? (error as TRPCClientError<ApiRouter>).data?.code
          : undefined;
      state.set({
        ...execution,
        pending: false,
        error:
          code === "CONFLICT"
            ? "El registro cambió o ese nombre ya está reservado. Recarga y revisa antes de guardar."
            : code === "NOT_FOUND"
              ? "Este registro ya no está disponible para tu cuenta. Recarga la vista."
              : code === "BAD_REQUEST"
                ? "Revisa los datos y las reglas de esta operación. No pudimos aplicar el cambio."
                : "No pudimos confirmar el resultado. Recarga para comprobar si se guardó antes de volver a intentarlo.",
      });
      return false;
    } finally {
      finish();
    }
  }

  return {
    run,
    pending: computed(() => current()?.pending ?? false),
    error: computed(() => current()?.error ?? null),
    success: computed(() => current()?.success ?? null),
    clear: () => {
      if (!current()?.pending) state.set(undefined);
    },
  };
}
