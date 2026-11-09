import { FinancialActionRequestSchema } from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { assistantAction } from "../../../../testing/assistant";
import { movement, tag } from "../../../../testing/rpc";
import {
  actionDetails,
  actionFields,
  editedAction,
} from "./action-presentation";

describe("readable action summaries and versioned editing inputs", () => {
  it("keeps tag colors as swatch data, never hexadecimal display text, including updates and removal", () => {
    const create = assistantAction({
      request: {
        kind: "create_tag",
        tag: { name: "Comida", color: "#87CEEB" },
      },
    });
    expect(actionDetails(create).rows).toContainEqual({
      label: "Color",
      value: "Color personalizado",
      color: "#87CEEB",
    });
    const update = assistantAction({
      request: { kind: "update_tag", tag: { id: tag.id, color: "#87CEEB" } },
      context: { tags: [{ ...tag, isArchived: false }], movement: null },
    });
    expect(actionDetails(update).rows).toContainEqual({
      label: "Color actual",
      value: "Color personalizado",
      color: tag.color,
    });
    expect(actionDetails(update).rows).toContainEqual({
      label: "Nuevo color",
      value: "Color personalizado",
      color: "#87CEEB",
    });
    const cleared = assistantAction({
      ...update,
      request: { kind: "update_tag", tag: { id: tag.id, color: null } },
    });
    expect(actionDetails(cleared).rows).toContainEqual({
      label: "Nuevo color",
      value: "Sin color",
      color: null,
    });
    for (const action of [create, update, cleared])
      expect(
        actionDetails(action).rows.some((row) =>
          /#[0-9a-f]{6}/i.test(row.value),
        ),
      ).toBe(false);
    expect(
      editedAction(create, { ...actionFields(create), noColor: true }),
    ).toMatchObject({ success: true, data: { tag: { color: null } } });
  });

  it("shows the existing color when creation reuses an active tag instead of recoloring it", () => {
    const action = assistantAction({
      request: {
        kind: "create_tag",
        tag: { name: tag.name, color: "#87CEEB" },
      },
      context: { tags: [{ ...tag, isArchived: false }], movement: null },
    });
    expect(actionDetails(action).rows).toContainEqual({
      label: "Color",
      value: "Color personalizado",
      color: tag.color,
    });
  });

  it("keeps exact objective amounts, schedules and dependent tags visible without implying a money transfer", () => {
    for (const kind of ["create_budget", "create_savings_goal"] as const) {
      const goal = {
        name: "Plan",
        amount: "9007199254740.99",
        tagIds: [tag.id],
        newTags: [{ name: "Nueva", color: "#112233" }],
        schedule: {
          period: "fixed",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
        },
      };
      const request = FinancialActionRequestSchema.parse(
        kind === "create_budget" ? { kind, budget: goal } : { kind, goal },
      );
      const action = assistantAction({
        request,
        context: { tags: [{ ...tag, isArchived: false }], movement: null },
      });
      const details = actionDetails(action);
      expect(details.rows.map((row) => row.value)).toContain(
        "$9.007.199.254.740,99",
      );
      expect(details.rows).toContainEqual({
        label: "Hasta, incluido",
        value: "2026-11-30",
      });
      expect(details.rows.find((row) => row.label === "Etiquetas")?.value).toBe(
        "Comida, Nueva (nueva)",
      );
      expect(details.notes.join(" ")).toContain("guardan juntos");
      expect(editedAction(action, actionFields(action))).toMatchObject({
        success: true,
        data: request,
      });
    }
  });

  it("preserves existing tag metadata unless an edit explicitly changes it and rejects invalid colors/selections", () => {
    const action = assistantAction({
      request: {
        kind: "update_tag",
        tag: { id: tag.id, name: "Nuevo nombre" },
      },
      context: { tags: [{ ...tag, isArchived: false }], movement: null },
    });
    const fields = actionFields(action);
    expect(fields.color).toBe(tag.color);
    expect(editedAction(action, fields)).toMatchObject({
      success: true,
      data: { tag: { color: tag.color, name: "Nuevo nombre" } },
    });
    expect(editedAction(action, { ...fields, color: "red" }).success).toBe(
      false,
    );
    expect(actionDetails(action).notes.join(" ")).toContain(
      "referencias históricas",
    );
    expect(
      actionDetails(
        assistantAction({
          ...action,
          request: { kind: "archive_tag", id: tag.id },
        }),
      ).notes.join(" "),
    ).toContain("Se conservará");
  });

  it("distinguishes a deliberate manual no-tag decision, a replacement and an explicit reset", () => {
    const action = assistantAction({
      request: {
        kind: "tag_movement",
        transactionId: movement.id,
        tagId: tag.id,
      },
      context: {
        tags: [{ ...tag, isArchived: false }],
        movement: { ...movement, tagDecisionOrigin: "manual", removedAt: null },
      },
    });
    expect(actionDetails(action).rows).toContainEqual({
      label: "Decisión actual",
      value: "Sin etiqueta, decisión manual",
    });
    expect(actionDetails(action).notes.join(" ")).toContain(
      "sustituyendo una decisión manual",
    );
    expect(
      editedAction(action, { ...actionFields(action), tagId: "" }),
    ).toMatchObject({ success: true, data: { tagId: null } });
    const reset = assistantAction({
      ...action,
      request: { kind: "reset_movement_tag", transactionId: movement.id },
    });
    expect(actionDetails(reset).rows).toContainEqual({
      label: "Nueva decisión",
      value: "Sin revisar",
    });
    expect(actionDetails(reset).notes.join(" ")).toContain("reglas aprobadas");
    expect(actionDetails(reset).notes.join(" ")).toContain(
      "no confirma ingresos",
    );
  });
});
