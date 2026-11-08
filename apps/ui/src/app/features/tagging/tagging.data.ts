import { computed, Injectable, inject, resource, signal } from "@angular/core";
import type { RecentTransaction, TagSummary } from "@lazyfinance/contracts";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { isCancelled, isUnauthorized } from "../../core/rpc/rpc-error";

export interface TagSelection {
  transactionId: string;
  tag: TagSummary | null;
  origin: RecentTransaction["tagDecisionOrigin"];
}

export interface TagDecisionOutcome {
  warning: string | null;
}

interface ConfirmedSelection {
  selection: TagSelection;
  version: number;
}

@Injectable()
export class TaggingData {
  private readonly rpc = inject(RpcClient);
  private readonly requested = signal(false);
  private readonly catalogRevision = signal(0);
  private version = 0;

  private readonly decision = signal<
    | {
        scope: RpcScope;
        selection: TagSelection;
        version: number;
        selections: ReadonlyMap<string, ConfirmedSelection>;
      }
    | undefined
  >(undefined);

  // Shared only within the page injector, never across identities.
  readonly changed = computed(() => {
    const decision = this.decision();
    return decision?.scope === this.rpc.authenticatedScope()
      ? decision
      : undefined;
  });

  readonly tags = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return this.requested() && scope
        ? { scope, revision: this.catalogRevision() }
        : undefined;
    },
    loader: ({ params: { scope }, abortSignal }) =>
      scope.client.tags.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });

  requestTags(): void {
    this.requested.set(true);

    if (this.tags.error()) this.tags.reload();
  }

  choose(
    transaction: RecentTransaction,
    tag: TagSummary | null,
    autoApply: boolean,
    signal: AbortSignal,
  ) {
    return this.save(
      this.rpc.requireScope(),
      transaction,
      tag,
      autoApply,
      signal,
    );
  }

  async createAndChoose(
    transaction: RecentTransaction,
    name: string,
    autoApply: boolean,
    signal: AbortSignal,
  ) {
    const scope = this.rpc.requireScope();
    const tag = await scope.client.tags.create.mutate({ name }, { signal });
    this.assertActive(scope, signal);
    this.catalogRevision.update((revision) => revision + 1);

    return this.save(scope, transaction, tag, autoApply, signal);
  }

  async reset(
    transaction: RecentTransaction,
    signal: AbortSignal,
  ): Promise<TagDecisionOutcome> {
    const scope = this.rpc.requireScope();
    const decision = await scope.client.tags.reset.mutate(
      { id: transaction.id },
      { signal },
    );
    this.assertActive(scope, signal);
    this.publish(scope, {
      transactionId: transaction.id,
      tag: null,
      origin: decision.origin,
    });

    return { warning: null };
  }

  private async save(
    scope: RpcScope,
    transaction: RecentTransaction,
    tag: TagSummary | null,
    autoApply: boolean,
    signal: AbortSignal,
  ): Promise<TagDecisionOutcome> {
    const decision = await scope.client.tags.decide.mutate(
      { transactionId: transaction.id, tagId: tag?.id ?? null },
      { signal },
    );
    this.assertActive(scope, signal);
    this.publish(scope, {
      transactionId: transaction.id,
      tag,
      origin: decision.origin,
    });

    if (autoApply && tag && transaction.merchant) {
      try {
        await scope.client.tagRules.create.mutate(
          {
            tagId: tag.id,
            accountId: transaction.account.id,
            direction: transaction.type,
            matchField: "merchant",
            matchValue: transaction.merchant,
            priority: 0,
            autoApply: true,
          },
          { signal },
        );
      } catch (error) {
        if (
          isUnauthorized(error) ||
          isCancelled(error) ||
          scope.signal.aborted ||
          signal.aborted
        )
          throw error;

        // The decision is already committed. Do not replay it or pretend it rolled back.
        return {
          warning:
            "La etiqueta se guardó, pero no pudimos crear la regla automática.",
        };
      }
    }

    this.assertActive(scope, signal);

    return { warning: null };
  }

  private assertActive(scope: RpcScope, signal: AbortSignal): void {
    scope.signal.throwIfAborted();
    signal.throwIfAborted();
  }

  private publish(scope: RpcScope, selection: TagSelection): void {
    const previous = this.decision();
    const selections = new Map(
      previous?.scope === scope ? previous.selections : [],
    );
    const version = ++this.version;
    selections.set(selection.transactionId, { selection, version });
    this.decision.set({ scope, selection, version, selections });
  }
}
