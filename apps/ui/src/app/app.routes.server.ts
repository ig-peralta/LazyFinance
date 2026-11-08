import { RenderMode, ServerRoute } from "@angular/ssr";

const privateHeaders = { "Cache-Control": "private, no-store" };

export const serverRoutes: ServerRoute[] = [
  { path: "ingresos", renderMode: RenderMode.Server, headers: privateHeaders },
  {
    path: "ingresos/fuentes",
    renderMode: RenderMode.Server,
    headers: privateHeaders,
  },
  { path: "dashboard", renderMode: RenderMode.Server, headers: privateHeaders },
  { path: "etiquetas", renderMode: RenderMode.Server, headers: privateHeaders },
  {
    path: "movimientos",
    renderMode: RenderMode.Server,
    headers: privateHeaders,
  },
  {
    path: "movimientos/:id",
    renderMode: RenderMode.Server,
    headers: privateHeaders,
  },
  {
    path: "presupuestos-y-metas",
    renderMode: RenderMode.Server,
    headers: privateHeaders,
  },
  {
    path: "**",
    renderMode: RenderMode.Server,
  },
];
