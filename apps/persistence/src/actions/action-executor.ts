import type { FinancialAction } from "@lazyfinance/contracts";
import {
  CreateBudgetCommandSchema,
  CreateSavingsCommandSchema,
  type FinancialActionCommand,
} from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { BudgetRepository } from "../finance/objective/budget.repository";
import { SavingsGoalRepository } from "../finance/savings-goal/savings-goal.repository";
import { TagRepository } from "../finance/tag/tag.repository";
import { TagRuleRepository } from "../finance/tag-rule/tag-rule.repository";

/** Only named domain commands, using the current scoped transaction. No model/network calls. */
@Injectable()
export class ActionExecutor {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly goals: SavingsGoalRepository,
    private readonly tags: TagRepository,
    private readonly decisions: TagRuleRepository,
  ) {}

  async execute(
    command: FinancialActionCommand,
    context: FinancialAction["context"],
  ): Promise<FinancialAction["results"]> {
    if (
      command.kind === "create_budget" ||
      command.kind === "create_savings_goal"
    ) {
      const { newTags, ...definition } = command.definition;
      const added = [];
      for (const tag of newTags) added.push(await this.tags.create(tag));
      const tagIds = [
        ...new Set([...definition.tagIds, ...added.map((tag) => tag.id)]),
      ];
      const value = { ...definition, tagIds };
      const row =
        command.kind === "create_budget"
          ? await this.budgets.create(
              CreateBudgetCommandSchema.parse({ budget: value }),
            )
          : await this.goals.create(
              CreateSavingsCommandSchema.parse({ goal: value }),
            );
      return [
        ...added.map((tag) => ({
          id: tag.id,
          title: tag.name,
          path: "/etiquetas",
          outcome: context.tags.some((existing) => existing.id === tag.id)
            ? ("unchanged" as const)
            : ("created" as const),
        })),
        {
          id: row.id,
          title: definition.name,
          path: `/${command.kind === "create_budget" ? "presupuestos" : "metas"}/${row.id}`,
          outcome: "created",
        },
      ];
    }
    if (
      command.kind === "create_tag" ||
      command.kind === "update_tag" ||
      command.kind === "archive_tag"
    ) {
      const row =
        command.kind === "create_tag"
          ? await this.tags.create(command.tag)
          : command.kind === "update_tag"
            ? await this.tags.update(command.tag)
            : await this.tags.archive(command.id);
      const unchanged =
        command.kind === "create_tag"
          ? context.tags.some((tag) => tag.id === row.id)
          : command.kind === "update_tag"
            ? context.tags.some(
                (tag) =>
                  tag.id === row.id &&
                  tag.name === row.name &&
                  tag.color === row.color,
              )
            : false;
      return [
        {
          id: row.id,
          title: row.name,
          path: "/etiquetas",
          outcome: unchanged
            ? "unchanged"
            : command.kind === "archive_tag"
              ? "archived"
              : command.kind === "update_tag"
                ? "updated"
                : "created",
        },
      ];
    }
    const row =
      command.kind === "tag_movement"
        ? await this.decisions.manual(command.transactionId, command.tagId)
        : await this.decisions.reset(command.transactionId);
    const unchanged =
      command.kind === "tag_movement"
        ? context.movement?.tagDecisionOrigin === "manual" &&
          (context.movement.tag?.id ?? null) === command.tagId
        : context.movement?.tagDecisionOrigin === "unreviewed";
    return [
      {
        id: row.transactionId,
        title: "Decisión de etiquetado",
        path: `/movimientos/${row.transactionId}`,
        outcome: unchanged
          ? "unchanged"
          : command.kind === "tag_movement"
            ? "tagged"
            : "reset",
      },
    ];
  }
}
