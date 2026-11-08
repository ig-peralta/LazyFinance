import type { BudgetDetail, BudgetRevision } from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";

const id = "00000000-0000-4000-8000-000000000041";
const tagId = "00000000-0000-4000-8000-000000000031";
const userId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-11-15T15:00:00Z");

type Client = RpcStubs<ReturnType<PersistenceClient["user"]>["objectives"]>;

function revision(update: Partial<BudgetRevision> = {}): BudgetRevision {
  return {
    id,
    budgetId: id,
    version: 1,
    name: "Groceries",
    amount: "280000.00",
    kind: "time_based",
    isRecurring: true,
    period: "monthly",
    startDate: "2026-11-01T03:00:00.000000Z",
    endDate: null,
    effectiveFrom: "2026-11-01T03:00:00.000000Z",
    recordedAt: "2026-11-01T03:00:00.000000Z",
    supersededAt: null,
    tags: [{ id: tagId, name: "Groceries", color: null }],
    ...update,
  };
}

function setup(update: Partial<BudgetDetail> = {}) {
  const detail: BudgetDetail = {
    id,
    version: 1,
    archivedAt: null,
    effective: revision(),
    pending: null,
    ...update,
  };
  const create = vi.fn<Client["createBudget"]["mutate"]>(async () => detail);
  const replace = vi.fn<Client["updateBudget"]["mutate"]>(async () => detail);
  const archive = vi.fn<Client["archiveBudget"]["mutate"]>(async () => detail);
  const get = vi.fn<Client["budget"]["query"]>(async () => detail);
  const objectives = {
    budget: { query: get },
    createBudget: { mutate: create },
    updateBudget: { mutate: replace },
    archiveBudget: { mutate: archive },
  } satisfies Pick<
    Client,
    "budget" | "createBudget" | "updateBudget" | "archiveBudget"
  >;
  const user = vi.fn((_userId: string) => ({ objectives }));
  const service = new ObjectivesService({
    user,
  } as unknown as PersistenceClient);
  return { service, create, replace, archive, get, user };
}

const edit = {
  id,
  expectedVersion: 1,
  budget: { name: "Groceries", amount: "320000", tagIds: [tagId] },
};

describe("budget management workflows", () => {
  it("canonicalizes an exact limit and sends local calendar boundaries, not owner input", async () => {
    const { service, create, user } = setup();
    await service.createBudgetForUser(
      userId,
      {
        name: " Groceries ",
        amount: "280000",
        tagIds: [tagId],
        schedule: { period: "monthly", startDate: "2026-11-01" },
      },
      now,
    );
    expect(user).toHaveBeenCalledWith(userId);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      budget: {
        name: "Groceries",
        amount: "280000.00",
        tagIds: [tagId],
        isRecurring: true,
        period: "monthly",
        startDate: "2026-11-01 00:00:00",
        endDate: null,
      },
    });
  });

  it("schedules a monthly edit without changing the current definition or rounding legacy bounds", async () => {
    const current = revision({ startDate: "2024-01-01T15:00:00.123456Z" });
    const { service, replace } = setup({ effective: current });
    await service.updateBudgetForUser(userId, edit, now);
    expect(replace).toHaveBeenCalledExactlyOnceWith({
      id,
      expectedVersion: 1,
      wasStarted: true,
      effectiveFrom: "2026-12-01 00:00:00",
      budget: {
        ...edit.budget,
        amount: "320000.00",
        isRecurring: true,
        period: "monthly",
        startDate: current.startDate,
        endDate: null,
      },
    });
    expect(current.amount).toBe("280000.00");
  });

  it("schedules annual edits for next January, not next month", async () => {
    const { service, replace } = setup({
      effective: revision({
        period: "yearly",
        startDate: "2026-01-01T03:00:00Z",
      }),
    });
    await service.updateBudgetForUser(userId, edit, now);
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveFrom: "2027-01-01 00:00:00" }),
    );
  });

  it("permits a replacement schedule before activation", async () => {
    const { service, replace } = setup({
      effective: null,
      pending: revision({
        startDate: "2026-12-01T03:00:00Z",
        effectiveFrom: "2026-12-01T03:00:00Z",
      }),
    });
    await service.updateBudgetForUser(
      userId,
      {
        ...edit,
        budget: {
          ...edit.budget,
          schedule: {
            period: "fixed",
            startDate: "2027-01-10",
            endDate: "2027-01-12",
          },
        },
      },
      now,
    );
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        wasStarted: false,
        effectiveFrom: "2027-01-10 00:00:00",
        budget: expect.objectContaining({
          isRecurring: false,
          period: null,
          endDate: "2027-01-13 00:00:00",
        }),
      }),
    );
  });

  it("rejects fixed-window financial edits, started schedule edits, archived and stale updates before writing", async () => {
    for (const detail of [
      {
        effective: revision({
          isRecurring: false,
          period: null,
          endDate: "2026-12-01T03:00:00Z",
        }),
      },
      { archivedAt: "2026-11-10T12:00:00Z" },
      { version: 2 },
    ] satisfies Partial<BudgetDetail>[]) {
      const { service, replace } = setup(detail);
      await expect(
        service.updateBudgetForUser(userId, edit, now),
      ).rejects.toThrow();
      expect(replace).not.toHaveBeenCalled();
    }
    const { service, replace } = setup();
    await expect(
      service.updateBudgetForUser(
        userId,
        {
          ...edit,
          budget: {
            ...edit.budget,
            schedule: { period: "yearly", startDate: "2026-01-01" },
          },
        },
        now,
      ),
    ).rejects.toThrow("schedule cannot be changed");
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not replay an ambiguous mutation and does not accept a caller's archival cutoff", async () => {
    const { service, replace, archive } = setup();
    replace.mockRejectedValue(new Error("connection lost"));
    await expect(
      service.updateBudgetForUser(userId, edit, now),
    ).rejects.toThrow("connection lost");
    expect(replace).toHaveBeenCalledTimes(1);
    await service.archiveBudgetForUser(userId, { id, expectedVersion: 1 });
    expect(archive).toHaveBeenCalledExactlyOnceWith({ id, expectedVersion: 1 });
  });
});
