import type { Insertable } from "kysely";
import type { ObjectiveTable } from "../../finance/objective/objective.tables";
import { seedId } from "./helpers";

type ObjectiveFixture = Omit<Insertable<ObjectiveTable>, "userId"> & {
  id: string;
};

export const tags = [
  { key: "salary", name: "Sueldo", color: "#15803D" },
  { key: "extraIncome", name: "Ingresos extra", color: "#22C55E" },
  { key: "housing", name: "Vivienda", color: "#EA580C" },
  { key: "groceries", name: "Supermercado", color: "#65A30D" },
  { key: "utilities", name: "Servicios básicos", color: "#0284C7" },
  { key: "transport", name: "Transporte", color: "#0891B2" },
  { key: "health", name: "Salud", color: "#DC2626" },
  { key: "dining", name: "Comida fuera", color: "#D97706" },
  { key: "leisure", name: "Ocio", color: "#9333EA" },
  { key: "shopping", name: "Compras", color: "#DB2777" },
  { key: "subscriptions", name: "Suscripciones", color: "#7C3AED" },
  { key: "family", name: "Familia", color: "#C2410C" },
  { key: "vacation", name: "Vacaciones", color: "#0D9488" },
  { key: "unexpected", name: "Imprevistos", color: "#B91C1C" },
  { key: "transfer", name: "Transferencias", color: "#64748B" },
  { key: "savings", name: "Ahorro", color: "#16A34A" },
] as const;

export type TagKey = (typeof tags)[number]["key"];

export const objectives: {
  value: ObjectiveFixture;
  tags: TagKey[];
}[] = [
  {
    value: {
      id: seedId("objective:monthly-groceries"),
      name: "Presupuesto mensual de supermercado",
      amount: "280000.00",
      kind: "time_based",
      intent: "spending",
      isRecurring: true,
      period: "monthly",
      startDate: new Date("2024-01-01T15:00:00.000Z"),
    },
    tags: ["groceries"],
  },
  {
    value: {
      id: seedId("objective:monthly-transport"),
      name: "Presupuesto mensual de transporte",
      amount: "110000.00",
      kind: "time_based",
      intent: "spending",
      isRecurring: true,
      period: "monthly",
      startDate: new Date("2024-01-01T15:00:00.000Z"),
    },
    tags: ["transport"],
  },
  {
    value: {
      id: seedId("objective:yearly-vacation"),
      name: "Presupuesto anual de vacaciones",
      amount: "650000.00",
      kind: "time_based",
      intent: "spending",
      isRecurring: true,
      period: "yearly",
      startDate: new Date("2024-01-01T15:00:00.000Z"),
    },
    tags: ["vacation"],
  },
  {
    value: {
      id: seedId("objective:emergency-fund"),
      name: "Fondo de emergencia",
      amount: "6500000.00",
      kind: "amount_based",
      intent: "saving",
    },
    tags: ["savings"],
  },
  {
    value: {
      id: seedId("objective:september-2025"),
      name: "Fiestas Patrias 2025",
      amount: "240000.00",
      kind: "time_based",
      intent: "spending",
      isRecurring: false,
      startDate: new Date("2025-09-01T15:00:00.000Z"),
      endDate: new Date("2025-10-01T15:00:00.000Z"),
    },
    tags: ["vacation", "family"],
  },
];
