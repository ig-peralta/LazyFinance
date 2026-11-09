import type { IconName } from "../../shared/ui/icon";

interface Destination {
  path: string;
  label: string;
  nestedPath?: string;
}

interface NavigationArea {
  path: string;
  label: string;
  icon: IconName;
  description: string;
  destinations: readonly Destination[];
}

export const workspaceNavigation: readonly NavigationArea[] = [
  {
    path: "/asistente",
    label: "Asistente",
    icon: "spark",
    description: "Una conversación para entender tus finanzas",
    destinations: [{ path: "/asistente", label: "Tu conversación" }],
  },
  {
    path: "/dashboard",
    label: "Resumen",
    icon: "overview",
    description: "Tu panorama financiero",
    destinations: [{ path: "/dashboard", label: "Vista general" }],
  },
  {
    path: "/movimientos",
    label: "Mi dinero",
    icon: "wallet",
    description: "Movimientos, cuentas y etiquetas",
    destinations: [
      { path: "/movimientos", label: "Movimientos" },
      { path: "/cuentas", label: "Cuentas" },
      { path: "/etiquetas", label: "Etiquetas" },
    ],
  },
  {
    path: "/presupuestos-y-metas",
    label: "Planificación",
    icon: "target",
    description: "Presupuestos, metas e ingresos",
    destinations: [
      {
        path: "/presupuestos-y-metas",
        label: "Presupuestos",
        nestedPath: "/presupuestos",
      },
      { path: "/metas", label: "Metas de ahorro" },
      { path: "/ingresos", label: "Ingresos" },
      { path: "/ingresos/fuentes", label: "Fuentes de ingreso" },
    ],
  },
  {
    path: "/seguridad",
    label: "Mi cuenta",
    icon: "security",
    description: "Tu cuenta, acceso y conexiones bancarias",
    destinations: [
      { path: "/seguridad", label: "Acceso y seguridad" },
      {
        path: "/aplicaciones-conectadas",
        label: "Aplicaciones conectadas",
        nestedPath: "/autorizar-mcp",
      },
      { path: "/conexiones-bancarias", label: "Conexiones bancarias" },
      { path: "/comenzar", label: "Configuración inicial" },
    ],
  },
];

export function workspaceLocation(url: string) {
  const path = url.split(/[?#]/, 1)[0];
  const matches = workspaceNavigation.flatMap((area) =>
    area.destinations
      .filter((destination) =>
        [destination.path, destination.nestedPath].some(
          (prefix) =>
            prefix && (path === prefix || path.startsWith(`${prefix}/`)),
        ),
      )
      .map((destination) => ({ area, destination })),
  );
  // Prefer the most specific destination (e.g. income sources over income).
  return (
    matches.sort(
      (left, right) =>
        right.destination.path.length - left.destination.path.length,
    )[0] ?? {
      area: workspaceNavigation[0],
      destination: workspaceNavigation[0].destinations[0],
    }
  );
}
