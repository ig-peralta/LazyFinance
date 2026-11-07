import { ApplicationRef, TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../testing/deferred";
import { movement, principal, setupRpc, tag } from "../../testing/rpc";
import { isCancelled } from "../core/rpc/rpc-error";
import { Account } from "../pages/dashboard/account/account";
import { DashboardPage } from "../pages/dashboard/dashboard.page";
import { AccountsData } from "./accounts/accounts.data";
import { ObjectivesData } from "./objectives/objectives.data";
import { SummariesData } from "./summaries/summaries.data";
import { TaggingData } from "./tagging/tagging.data";
import { TransactionsData } from "./transactions/transactions.data";

const account = (name: string) => ({
  id: name,
  alias: name,
  type: "checking",
  currency: "CLP",
  balance: "10.00",
  lastSyncedAt: null,
});

const stable = () => TestBed.inject(ApplicationRef).whenStable();

describe("feature resource and command lifetimes", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("does not fetch protected data before credentials have been verified", async () => {
    const { credentials, callsTo } = setupRpc({}, "browser", false);
    const data = TestBed.inject(AccountsData);
    TestBed.tick();
    await stable();
    expect(data.accounts.status()).toBe("idle");
    expect(callsTo("accounts.list")).toHaveLength(0);
    credentials.accept(principal, "verified");
    TestBed.tick();
    await stable();
    expect(callsTo("accounts.list")[0].authorization).toBe("Bearer verified");
  });

  it("clears an already displayed identity immediately, before the next user response arrives", async () => {
    const bob = deferred<unknown>();
    const { credentials, callsTo } = setupRpc({
      "accounts.list": (_input, call) =>
        call.authorization === "Bearer alice"
          ? [account("ALICE_PRIVATE")]
          : bob.promise,
    });
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("ALICE_PRIVATE");
    credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("ALICE_PRIVATE");
    await vi.waitFor(() => expect(callsTo("accounts.list")).toHaveLength(2));
    bob.resolve([account("BOB_PRIVATE")]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("BOB_PRIVATE");
    credentials.clear();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("BOB_PRIVATE");
  });

  it("drops late old-user results and reloads under a refreshed token", async () => {
    const old = deferred<unknown>();
    const { credentials, callsTo } = setupRpc({
      "accounts.list": (_input, call) =>
        call.authorization === "Bearer alice"
          ? old.promise
          : [account("CURRENT_ONLY")],
    });
    const data = TestBed.inject(AccountsData);
    TestBed.tick();
    await vi.waitFor(() => expect(callsTo("accounts.list")).toHaveLength(1));
    credentials.accept(principal, "refreshed");
    TestBed.tick();
    await stable();
    expect(data.accounts.value()).toEqual([account("CURRENT_ONLY")]);
    old.resolve([account("OLD_SECRET")]);
    await Promise.resolve();
    TestBed.tick();
    expect(data.accounts.value()).toEqual([account("CURRENT_ONLY")]);
    expect(callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
  });

  it("uses the selected month as a real query dependency", async () => {
    const { callsTo } = setupRpc();
    const summaries = TestBed.inject(SummariesData),
      objectives = TestBed.inject(ObjectivesData);
    summaries.month.set("2026-09");
    objectives.month.set("2026-09");
    TestBed.tick();
    await stable();
    summaries.month.set("2026-10");
    objectives.month.set("2026-10");
    TestBed.tick();
    await stable();
    expect(callsTo("summaries.monthly").map((call) => call.input)).toEqual([
      { month: "2026-09" },
      { month: "2026-10" },
    ]);
    expect(callsTo("summaries.comparison").at(-1)?.input).toEqual({
      month: "2026-10",
    });
    expect(callsTo("objectives.progress").at(-1)?.input).toEqual({
      month: "2026-10",
    });
  });

  it("preserves confirmed decisions when an older read finishes, but lets a later reload reconcile server changes", async () => {
    const old = deferred<unknown>();
    const { callsTo, handlers } = setupRpc({
      "transactions.recent": () => old.promise,
    });
    const transactions = TestBed.inject(TransactionsData),
      tagging = TestBed.inject(TaggingData);
    TestBed.tick();
    await vi.waitFor(() =>
      expect(callsTo("transactions.recent")).toHaveLength(1),
    );
    const second = { ...movement, id: "second-movement" };
    await tagging.choose(movement, tag, false, new AbortController().signal);
    await tagging.choose(second, null, false, new AbortController().signal);
    expect(callsTo("transactions.recent")[0].options?.signal?.aborted).toBe(
      false,
    );
    old.resolve([movement, second]);
    await stable();
    expect(
      transactions
        .items()
        .map((item) => [item.tag?.name ?? null, item.tagDecisionOrigin]),
    ).toEqual([
      ["Comida", "manual"],
      [null, "manual"],
    ]);
    handlers["transactions.recent"] = () => [
      {
        ...movement,
        tag: { ...tag, name: "Changed elsewhere" },
        tagDecisionOrigin: "manual",
      },
    ];
    transactions.recent.reload();
    TestBed.tick();
    await stable();
    expect(transactions.items()[0].tag?.name).toBe("Changed elsewhere");
  });

  it("shares the lazy catalog and invalidates it after creation without cancelling a read into incomplete local data", async () => {
    let created = false;
    const { callsTo } = setupRpc({
      "tags.list": () =>
        created ? [tag, { ...tag, id: "new-tag", name: "New" }] : [tag],
      "tags.create": () => {
        created = true;
        return { ...tag, id: "new-tag", name: "New" };
      },
    });
    const tagging = TestBed.inject(TaggingData);
    TestBed.tick();
    await stable();
    expect(callsTo("tags.list")).toHaveLength(0);
    tagging.requestTags();
    tagging.requestTags();
    TestBed.tick();
    await stable();
    expect(callsTo("tags.list")).toHaveLength(1);
    await tagging.createAndChoose(
      movement,
      "New",
      false,
      new AbortController().signal,
    );
    TestBed.tick();
    await stable();
    expect(callsTo("tags.list")).toHaveLength(2);
    expect(tagging.tags.value().map((item) => item.name)).toEqual([
      "Comida",
      "New",
    ]);
  });

  it("does not continue a multi-step command under a newer identity", async () => {
    const created = deferred<unknown>();
    const { credentials, callsTo } = setupRpc({
      "tags.create": () => created.promise,
    });
    const tagging = TestBed.inject(TaggingData);
    const result = tagging
      .createAndChoose(
        movement,
        "Old user tag",
        true,
        new AbortController().signal,
      )
      .catch((error) => error);
    await vi.waitFor(() => expect(callsTo("tags.create")).toHaveLength(1));
    credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    expect(isCancelled(await result)).toBe(true);
    created.resolve(tag);
    await Promise.resolve();
    expect(callsTo("tags.decide")).toHaveLength(0);
    expect(callsTo("tagRules.create")).toHaveLength(0);
    expect(tagging.changed()).toBeUndefined();
  });

  it("cancels page-owned reads on destruction and leaves no private TransferState", async () => {
    const pending = deferred<unknown>();
    const { callsTo } = setupRpc({ "accounts.list": () => pending.promise });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(callsTo("accounts.list")).toHaveLength(1));
    fixture.destroy();
    expect(callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
    pending.resolve([]);
    await stable();
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });
});
