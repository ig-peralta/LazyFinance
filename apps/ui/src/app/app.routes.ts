import { Routes } from "@angular/router";
import { authGuard } from "./guards/auth.guard";

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
    canActivate: [authGuard],
    loadComponent: () =>
      import("./layout/app-shell/app-shell").then((m) => m.AppShell),
    children: [
      {
        path: "cuentas",
        title: "Cuentas y sincronización",
        loadComponent: () =>
          import("./pages/accounts/accounts.page").then((m) => m.AccountsPage),
      },
      {
        path: "metas",
        title: "Metas de ahorro",
        loadComponent: () =>
          import("./pages/objectives/savings.page").then((m) => m.SavingsPage),
      },
      {
        path: "metas/:id",
        title: "Meta de ahorro",
        loadComponent: () =>
          import("./pages/objectives/savings-goal.page").then(
            (m) => m.SavingsGoalPage,
          ),
      },
      {
        path: "presupuestos/:id/movimientos",
        title: "Compras del presupuesto",
        loadComponent: () =>
          import("./pages/objectives/budget-evidence.page").then(
            (m) => m.BudgetEvidencePage,
          ),
      },
      {
        path: "presupuestos/:id",
        title: "Configurar presupuesto",
        loadComponent: () =>
          import("./pages/objectives/budget.page").then((m) => m.BudgetPage),
      },
      {
        path: "ingresos",
        title: "Ingresos",
        loadComponent: () =>
          import("./pages/income/income.page").then((m) => m.IncomePage),
      },
      {
        path: "ingresos/fuentes",
        title: "Fuentes de ingreso",
        loadComponent: () =>
          import("./pages/income/sources.page").then((m) => m.SourcesPage),
      },
      {
        path: "seguridad",
        title: "Acceso y seguridad",
        loadComponent: () =>
          import("./pages/security/security.page").then((m) => m.SecurityPage),
      },
      {
        path: "dashboard",
        title: "Resumen",
        loadComponent: () =>
          import("./pages/dashboard/dashboard.page").then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: "etiquetas",
        title: "Etiquetas",
        loadComponent: () =>
          import("./pages/tags/tags.page").then((m) => m.TagsPage),
      },
      {
        path: "movimientos",
        title: "Movimientos",
        loadComponent: () =>
          import("./pages/transactions/history.page").then(
            (m) => m.HistoryPage,
          ),
      },
      {
        path: "movimientos/:id",
        title: "Detalle del movimiento",
        loadComponent: () =>
          import("./pages/transactions/transaction.page").then(
            (m) => m.TransactionPage,
          ),
      },
      {
        path: "presupuestos-y-metas",
        title: "Presupuestos y metas",
        loadComponent: () =>
          import("./pages/objectives/objectives.page").then(
            (m) => m.ObjectivesPage,
          ),
      },
    ],
  },
];
