import { convertToParamMap } from "@angular/router";
import { describe, expect, it } from "vitest";
import { movementReturn } from "./return-context";

const evidence = {
  returnTo: "budget-evidence",
  budget: "00000000-0000-4000-8000-000000000001",
  revision: "00000000-0000-4000-8000-000000000002",
  month: "2026-10",
  asOf: "2026-11-01T03:00:00.000Z",
  adjustmentsAsOf: "2026-11-11T03:00:00.000Z",
  reported: "12345678901234567890.01",
};

describe("bounded movement return context", () => {
  it("retains the exact budget revision, month, cutoffs and amount without forwarding unrelated parameters", () => {
    expect(
      movementReturn(
        convertToParamMap({ ...evidence, redirect: "https://example.test" }),
      ),
    ).toEqual({
      path: `/presupuestos/${evidence.budget}/movimientos`,
      label: "Volver al detalle del presupuesto",
      queryParams: {
        revision: evidence.revision,
        month: evidence.month,
        asOf: evidence.asOf,
        adjustmentsAsOf: evidence.adjustmentsAsOf,
        reported: evidence.reported,
      },
    });
  });

  it.each([
    { ...evidence, budget: "../seguridad" },
    { ...evidence, revision: "invalid" },
    { ...evidence, month: "2026-13" },
    { ...evidence, asOf: "yesterday" },
    { returnTo: "https://example.test", from: "onboarding" },
    { returnTo: "income", month: "invalid" },
  ])("rejects invalid return context without leaking it into ledger filters", (params) => {
    expect(movementReturn(convertToParamMap(params))).toEqual({
      path: "/movimientos",
      label: "Volver a movimientos",
      queryParams: {},
    });
  });

  it("ignores a malformed reported amount without dropping valid evidence context", () => {
    expect(
      movementReturn(convertToParamMap({ ...evidence, reported: "1e10" }))
        .queryParams,
    ).not.toHaveProperty("reported");
  });

  it("returns to income with only its selected month", () => {
    expect(
      movementReturn(
        convertToParamMap({ returnTo: "income", month: "2026-10", tag: "all" }),
      ),
    ).toEqual({
      path: "/ingresos",
      label: "Volver a ingresos",
      queryParams: { month: "2026-10" },
    });
  });

  it("preserves ordinary ledger filters without accepting an arbitrary destination", () => {
    expect(
      movementReturn(
        convertToParamMap({
          from: "2026-10-01",
          before: "2026-11-01",
          merchant: "Pago & café",
          direction: "credit",
          returnUrl: "https://example.test",
          asOf: evidence.asOf,
        }),
      ).queryParams,
    ).toEqual({
      from: "2026-10-01",
      before: "2026-11-01",
      merchant: "Pago & café",
      direction: "credit",
    });
  });
});
