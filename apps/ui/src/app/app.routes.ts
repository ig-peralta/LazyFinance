import type { Routes } from "@angular/router";
import { AppShell } from "./layout/app-shell/app-shell";
import { WorkspaceBoundary } from "./layout/workspace-boundary";
import { workspaceRoute } from "./layout/workspace-route";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    loadComponent: () =>
      import("./pages/landing/landing.page").then((m) => m.LandingPage),
  },
  {
    path: "login",
    loadComponent: () =>
      import("./pages/login/login.page").then((m) => m.LoginPage),
  },
  {
    path: "",
    component: WorkspaceBoundary,
    children: [
      {
        path: "",
        component: AppShell,
        children: [
          workspaceRoute("comenzar", {
            heading: "Primeros pasos",
            load: () =>
              import("./pages/onboarding/onboarding.page").then(
                (m) => m.OnboardingPage,
              ),
          }),
          workspaceRoute("cuentas", {
            heading: "Cuentas y saldos",
            load: () =>
              import("./pages/accounts/accounts.page").then(
                (m) => m.AccountsPage,
              ),
          }),
          workspaceRoute("metas", {
            heading: "Metas de ahorro",
            load: () =>
              import("./pages/objectives/savings/savings.page").then(
                (m) => m.SavingsPage,
              ),
          }),
          workspaceRoute("metas/:id", {
            heading: "Meta de ahorro",
            load: () =>
              import("./pages/objectives/savings/savings-goal.page").then(
                (m) => m.SavingsGoalPage,
              ),
          }),
          workspaceRoute("presupuestos/:id/movimientos", {
            heading: "Compras del presupuesto",
            load: () =>
              import(
                "./pages/objectives/budgets/evidence/budget-evidence.page"
              ).then((m) => m.BudgetEvidencePage),
          }),
          workspaceRoute("presupuestos/:id", {
            heading: "Configurar presupuesto",
            load: () =>
              import("./pages/objectives/budgets/budget.page").then(
                (m) => m.BudgetPage,
              ),
          }),
          workspaceRoute("ingresos/fuentes", {
            heading: "Fuentes de ingreso",
            load: () =>
              import("./pages/income/sources/sources.page").then(
                (m) => m.SourcesPage,
              ),
          }),
          workspaceRoute("ingresos", {
            heading: "Ingresos",
            load: () =>
              import("./pages/income/income.page").then((m) => m.IncomePage),
          }),
          workspaceRoute("seguridad", {
            heading: "Acceso y seguridad",
            load: () =>
              import("./pages/security/security.page").then(
                (m) => m.SecurityPage,
              ),
          }),
          workspaceRoute("autorizar-mcp", {
            heading: "Autorizar una aplicación",
            load: () =>
              import("./pages/mcp-authorization/mcp-consent.page").then(
                (m) => m.McpConsentPage,
              ),
          }),
          workspaceRoute("aplicaciones-conectadas", {
            heading: "Aplicaciones conectadas",
            load: () =>
              import("./pages/mcp-authorization/mcp-grants.page").then(
                (m) => m.McpGrantsPage,
              ),
          }),
          workspaceRoute("conexiones-bancarias", {
            heading: "Conexiones bancarias",
            load: () =>
              import("./pages/banking/bank-connections.page").then(
                (m) => m.BankConnectionsPage,
              ),
          }),
          workspaceRoute("dashboard", {
            heading: "Resumen",
            load: () =>
              import("./pages/dashboard/dashboard.page").then(
                (m) => m.DashboardPage,
              ),
          }),
          workspaceRoute("etiquetas", {
            heading: "Etiquetas",
            load: () =>
              import("./pages/tags/tags.page").then((m) => m.TagsPage),
          }),
          workspaceRoute("movimientos", {
            heading: "Movimientos",
            load: () =>
              import("./pages/transactions/history/history.page").then(
                (m) => m.HistoryPage,
              ),
          }),
          workspaceRoute("movimientos/:id", {
            heading: "Detalle del movimiento",
            load: () =>
              import("./pages/transactions/detail/transaction.page").then(
                (m) => m.TransactionPage,
              ),
          }),
          workspaceRoute("presupuestos-y-metas", {
            heading: "Presupuestos y metas",
            load: () =>
              import("./pages/objectives/objectives.page").then(
                (m) => m.ObjectivesPage,
              ),
          }),
        ],
      },
    ],
  },
];
