import { randomUUID } from "node:crypto";
import type {
  CommitProviderSync,
  PreparedProviderAccount,
  ProviderSyncFacts,
  ProviderSyncScope,
} from "@lazyfinance/contracts/internal";
import { toCents } from "../../_utils/money";
import { createRuleMatcher } from "../../transactions/tagging/tag-matching";
import type {
  ConnectorPage,
  NormalizedMovement,
} from "../connector/normalized-banking.schema";
import {
  bookingDate,
  movementDirection,
  movementKey,
} from "./normalized-movement";

export class InvalidBatchError extends Error {}

export function syncScope(
  connectionId: string,
  revision: number,
  pages: ConnectorPage[],
): ProviderSyncScope {
  const keys = new Map<
    string,
    { accountExternalId: string; externalId: string }
  >();

  for (const page of pages)
    for (const row of [...page.movements, ...page.removedMovements]) {
      keys.set(movementKey(row.accountExternalId, row.externalId), {
        accountExternalId: row.accountExternalId,
        externalId: row.externalId,
      });

      if ("relatedMovement" in row && row.relatedMovement) {
        const related = row.relatedMovement;
        keys.set(
          movementKey(related.accountExternalId, related.movementExternalId),
          {
            accountExternalId: related.accountExternalId,
            externalId: related.movementExternalId,
          },
        );
      }
    }

  return {
    connectionId,
    revision,
    keys: [...keys.values()].sort((a, b) =>
      movementKey(a.accountExternalId, a.externalId).localeCompare(
        movementKey(b.accountExternalId, b.externalId),
      ),
    ),
  };
}

/** No I/O: prepare normalized provider writes against one immutable factual snapshot. */
export function prepareSync(
  scope: ProviderSyncScope,
  facts: ProviderSyncFacts,
  pages: ConnectorPage[],
): CommitProviderSync {
  const last = pages.at(-1)!;
  if (
    facts.state.lastProviderObservedAt &&
    new Date(last.observedAt) < new Date(facts.state.lastProviderObservedAt)
  )
    throw new InvalidBatchError("Provider returned an older snapshot");

  const accounts = new Map<string, PreparedProviderAccount>(
    facts.accounts
      .filter((row) => row.externalId !== null)
      .map((row) => [
        row.externalId!,
        {
          id: row.id,
          externalId: row.externalId!,
          type: row.type,
          currency: row.currency,
          number: row.number,
          holderName: row.holderName,
          providerObservedAt:
            row.providerObservedAt ?? "1970-01-01T00:00:00.000Z",
          historyCompleteness: row.historyCompleteness,
          historyFrom: row.historyFrom,
          historyThrough: row.historyThrough,
          balance: row.balance,
          lastSyncedAt: row.lastSyncedAt,
        },
      ]),
  );
  const changedAccounts = new Set<string>();

  for (const page of pages)
    for (const snapshot of page.accounts) {
      const existing = accounts.get(snapshot.externalId);

      if (
        existing &&
        new Date(page.observedAt) < new Date(existing.providerObservedAt)
      )
        continue;

      if (
        existing &&
        (existing.type === "credit_card") !== (snapshot.type === "credit_card")
      )
        throw new InvalidBatchError("Account balance meaning changed");

      const olderBalance =
        existing?.lastSyncedAt &&
        snapshot.reportedBalance?.asOf &&
        new Date(snapshot.reportedBalance.asOf) <
          new Date(existing.lastSyncedAt);
      accounts.set(snapshot.externalId, {
        id: existing?.id ?? randomUUID(),
        externalId: snapshot.externalId,
        type: snapshot.type,
        currency: snapshot.currency,
        number: snapshot.number,
        holderName: snapshot.holderName,
        providerObservedAt: page.observedAt,
        historyCompleteness:
          existing && snapshot.historyCoverage.completeness === "unknown"
            ? existing.historyCompleteness
            : snapshot.historyCoverage.completeness,
        historyFrom:
          existing && snapshot.historyCoverage.completeness === "unknown"
            ? existing.historyFrom
            : snapshot.historyCoverage.from,
        historyThrough:
          existing && snapshot.historyCoverage.completeness === "unknown"
            ? existing.historyThrough
            : snapshot.historyCoverage.through,
        balance:
          snapshot.reportedBalance === null || olderBalance
            ? (existing?.balance ?? null)
            : snapshot.reportedBalance.amount,
        lastSyncedAt:
          snapshot.reportedBalance === null || olderBalance
            ? (existing?.lastSyncedAt ?? null)
            : snapshot.reportedBalance.asOf,
      });
      changedAccounts.add(snapshot.externalId);
    }

  const movements = new Map<string, NormalizedMovement>();
  const observed = new Map<string, string>();
  const removed = new Map<string, CommitProviderSync["removals"][number]>();

  for (const page of pages) {
    for (const movement of page.movements) {
      const key = movementKey(movement.accountExternalId, movement.externalId);
      const earlier = movements.get(key);
      if (earlier && JSON.stringify(earlier) !== JSON.stringify(movement))
        throw new InvalidBatchError("Conflicting versions in one sync run");

      movements.set(key, movement);
      observed.set(key, page.observedAt);
    }

    for (const removal of page.removedMovements)
      removed.set(movementKey(removal.accountExternalId, removal.externalId), {
        ...removal,
        observedAt: page.observedAt,
      });
  }

  const existingMovements = new Map(
    facts.movements.map((row) => [
      movementKey(row.accountExternalId, row.externalId),
      row,
    ]),
  );
  const tombstones = new Set(
    facts.removals.map((row) =>
      movementKey(row.accountExternalId, row.movementExternalId),
    ),
  );
  const matcher = createRuleMatcher(facts.rules);
  const prepared: CommitProviderSync["movements"] = [];

  for (const [key, movement] of movements) {
    if (removed.has(key) || tombstones.has(key)) continue;

    const owner = accounts.get(movement.accountExternalId);
    if (!owner)
      throw new InvalidBatchError("Movement references an unknown account");

    const existing = existingMovements.get(key);
    if (existing && existing.source !== "provider")
      throw new InvalidBatchError("Provider ID collides with manual movement");

    const observedAt = observed.get(key)!;

    if (
      existing?.removedAt ||
      (existing?.providerObservedAt &&
        new Date(observedAt) < new Date(existing.providerObservedAt)) ||
      (existing?.providerUpdatedAt &&
        movement.providerUpdatedAt &&
        new Date(movement.providerUpdatedAt) <
          new Date(existing.providerUpdatedAt))
    )
      continue;

    const relation = movement.relatedMovement;
    const priorPair =
      existing?.providerInternalAssessment === "internal" &&
      relation &&
      (relation.kind === "transfer_pair" ||
        relation.kind === "card_payment_pair") &&
      existing.relationKind === relation.kind &&
      existing.relatedAccountExternalId === relation.accountExternalId &&
      existing.relatedMovementExternalId === relation.movementExternalId &&
      existing.amount === movement.amount;
    const assessment = assess(
      movement,
      owner,
      movements,
      accounts,
      removed,
      Boolean(
        priorPair &&
          !tombstones.has(
            movementKey(
              relation!.accountExternalId,
              relation!.movementExternalId,
            ),
          ),
      ),
    );
    const effective =
      existing?.userInternalOverride ??
      (assessment === "unknown" ? null : assessment === "internal");
    const direction = movementDirection(movement.amount);
    const conflict =
      (existing?.userInternalOverride === false && assessment === "internal") ||
      (existing?.hasReceipt && (direction !== "credit" || effective !== false));
    const reviewStatus =
      existing?.reviewStatus === "needs_review" || conflict
        ? ("needs_review" as const)
        : ("clear" as const);
    const booked = bookingDate(movement.booked);
    const correction =
      existing &&
      (existing.merchant !== movement.merchant ||
        existing.description !== movement.description ||
        existing.type !== direction ||
        existing.reviewStatus !== reviewStatus ||
        existing.amount !== movement.amount ||
        existing.providerKind !== movement.providerKind ||
        existing.isInternalMovement !== effective);
    const decision =
      existing?.tagDecisionOrigin !== "rule" || correction
        ? matcher.automaticDecision({
            accountId: owner.id,
            type: direction,
            merchant: movement.merchant,
            description: movement.description,
            tagDecisionOrigin: existing?.tagDecisionOrigin ?? "unreviewed",
            tagId: existing?.tagId ?? null,
            tagRuleId: existing?.tagRuleId ?? null,
            removedAt: null,
            reviewStatus,
            isInternalMovement: effective,
          })
        : undefined;
    prepared.push({
      id: existing?.id ?? randomUUID(),
      accountExternalId: movement.accountExternalId,
      externalId: movement.externalId,
      amount: movement.amount,
      type: direction,
      bookedAt: booked.bookedAt.toISOString(),
      bookedPrecision: movement.booked.precision,
      bookedOn: booked.bookedOn,
      description: movement.description,
      merchant: movement.merchant,
      providerUpdatedAt: movement.providerUpdatedAt,
      providerObservedAt: observedAt,
      providerKind: movement.providerKind,
      relationKind: relation?.kind ?? null,
      relatedAccountExternalId: relation?.accountExternalId ?? null,
      relatedMovementExternalId: relation?.movementExternalId ?? null,
      counterpartyHolder: movement.counterpartyHolder,
      providerInternalAssessment: assessment,
      ...(decision ? { decision } : {}),
    });
  }

  return {
    scope,
    expectedFingerprint: facts.fingerprint,
    observedAt: last.observedAt,
    checkpoint: last.checkpoint,
    accounts: [...changedAccounts].map((key) => accounts.get(key)!),
    movements: prepared,
    removals: [...removed.values()],
  };
}

function assess(
  movement: NormalizedMovement,
  owner: PreparedProviderAccount,
  movements: Map<string, NormalizedMovement>,
  accounts: Map<string, PreparedProviderAccount>,
  removed: Map<string, unknown>,
  previouslyVerified: boolean,
) {
  const relation = movement.relatedMovement;
  if (
    relation &&
    (relation.kind === "transfer_pair" || relation.kind === "card_payment_pair")
  ) {
    const otherAccount = accounts.get(relation.accountExternalId);
    const other = movements.get(
      movementKey(relation.accountExternalId, relation.movementExternalId),
    );
    const paired =
      otherAccount &&
      other &&
      !removed.has(
        movementKey(relation.accountExternalId, relation.movementExternalId),
      ) &&
      other.relatedMovement?.kind === relation.kind &&
      other.relatedMovement.accountExternalId === movement.accountExternalId &&
      other.relatedMovement.movementExternalId === movement.externalId &&
      toCents(other.amount) + toCents(movement.amount) === 0n;
    const typesMatch =
      relation.kind === "card_payment_pair"
        ? (owner.type === "credit_card") !==
          (otherAccount?.type === "credit_card")
        : owner.type !== "credit_card" && otherAccount?.type !== "credit_card";
    if (
      paired &&
      relation.accountExternalId !== movement.accountExternalId &&
      typesMatch
    )
      return "internal";
    if (
      previouslyVerified &&
      !removed.has(
        movementKey(relation.accountExternalId, relation.movementExternalId),
      )
    )
      return "internal";

    return "unknown";
  }
  if (["transfer", "card_payment", "unknown"].includes(movement.providerKind))
    return "unknown";
  if (
    movement.providerKind === "reversal" &&
    relation?.kind === "reversal" &&
    accounts.has(relation.accountExternalId)
  )
    return "external";
  if (
    movement.providerKind === "other" &&
    movement.merchant !== null &&
    (owner.type !== "credit_card" ||
      movementDirection(movement.amount) === "debit")
  )
    return "external";

  return "unknown";
}
