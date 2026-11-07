import type { PreparedProviderAccount } from "@lazyfinance/contracts/internal";
import { toCents } from "../../utils/money";
import type { NormalizedMovement } from "../connector/normalized-banking.schema";
import { movementDirection, movementKey } from "./normalized-movement";

export function assessMovement(
  movement: NormalizedMovement,
  owner: PreparedProviderAccount,
  movements: Map<string, NormalizedMovement>,
  accounts: Map<string, PreparedProviderAccount>,
  removed: Map<string, unknown>,
  previouslyVerified: boolean,
): "internal" | "external" | "unknown" {
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
