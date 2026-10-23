import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: 'dashboard',
        title: 'Resumen',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'etiquetas',
        title: 'Etiquetas',
        loadComponent: () => import('./pages/tags/tags.page').then((m) => m.TagsPage),
      },
      {
        path: 'presupuestos-y-metas',
        title: 'Presupuestos y metas',
        loadComponent: () =>
          import('./pages/objectives/objectives.page').then((m) => m.ObjectivesPage),
      },
    ],
  },
];
