import { describe, expect, it } from "vitest";
import { integration } from "../fixtures/persistence";
import { measureReads, readCriteria } from "./measure-reads";
import { profiles, readFixture } from "./read-fixture";
import { writePerformanceReport } from "./report";
import { captureReadPlans, prepareSqlStatistics } from "./sql-diagnostics";

describe("authenticated financial reads from eight different owners", () => {
  // Both profiles are measured in this file, sequentially, on fresh owner fixtures.
  it("measures the uniform baseline and representative history separately", async () => {
    if (!integration) throw new Error("Use pnpm test:performance");
    const measuredProfiles = [];
    for (const profile of profiles) {
      const { f, api, callers, dataset } = await readFixture(profile);
      try {
        await prepareSqlStatistics(f.db);
        const results: Awaited<ReturnType<typeof measureReads>>[] = [];
        const record = {
          id: profile,
          title:
            profile === "uniform"
              ? "Uniform baseline"
              : "Representative history",
          dataset,
          results,
          outcome: "incomplete",
          queryPlans: null as Awaited<
            ReturnType<typeof captureReadPlans>
          > | null,
        };
        measuredProfiles.push(record);
        for (const route of [
          "accounts.list",
          "transactions.recent",
          "summaries.monthly",
          "objectives.progress",
        ] as const) {
          results.push(
            await measureReads(
              route,
              callers.map((caller) => ({
                ...caller,
                request: caller.requests[route],
              })),
              f.environment.get("PERSISTENCE_RPC_URL"),
              f.db,
            ),
          );
          writePerformanceReport("financial-reads", {
            outcome: "incomplete",
            criteria: readCriteria,
            profiles: measuredProfiles,
          });
        }
        record.outcome = results.every(
          (result) =>
            result.stage === "measured" &&
            result.successful === readCriteria.requests &&
            result.errors === 0 &&
            result.p95Ms !== null &&
            result.p95Ms < readCriteria.targetP95Ms,
        )
          ? "passed"
          : "failed";
        // Diagnostic replays are explicitly outside acceptance and use the same RLS path.
        record.queryPlans = await captureReadPlans(profile, callers[0].userId, [
          callers[0].requests["transactions.recent"],
          callers[0].requests["summaries.monthly"],
          callers[0].requests["objectives.progress"],
        ]);
        writePerformanceReport("financial-reads", {
          outcome: "incomplete",
          criteria: readCriteria,
          profiles: measuredProfiles,
        });
      } finally {
        await api.app.close();
        await f.db.close();
      }
    }
    const passed =
      measuredProfiles.length === profiles.length &&
      measuredProfiles.every((profile) => profile.outcome === "passed");
    writePerformanceReport("financial-reads", {
      outcome: passed ? "passed" : "failed",
      criteria: readCriteria,
      profiles: measuredProfiles,
    });
    expect(
      passed,
      "Read acceptance failed; inspect both eight-owner profiles",
    ).toBe(true);
  }, 600_000);
});
