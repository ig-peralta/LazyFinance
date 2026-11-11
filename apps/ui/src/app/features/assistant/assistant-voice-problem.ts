import type { AssistantVoiceProblemCode } from "@lazyfinance/contracts";

export type VoiceProblemCode =
  | AssistantVoiceProblemCode
  | "microphone_denied"
  | "microphone_unavailable"
  | "history_unavailable";
export interface VoiceProblem {
  code: VoiceProblemCode;
  title: string;
  message: string;
  severity: "error" | "warning";
}

const descriptions: Record<VoiceProblemCode, [string, string]> = {
  rate_limited: [
    "Espera antes de iniciar otra sesión",
    "Has alcanzado el límite de sesiones de voz.",
  ],
  capacity: ["La voz está ocupada", "Inténtalo de nuevo en unos instantes."],
  session_active: [
    "Ya hay una sesión de voz abierta",
    "Ciérrala en la otra pestaña o dispositivo e inténtalo de nuevo.",
  ],
  unavailable: ["La voz no está disponible", "Inténtalo de nuevo más tarde."],
  setup_failed: [
    "No se pudo iniciar la voz",
    "Vuelve a intentarlo en unos instantes.",
  ],
  connection_lost: [
    "Se perdió la conexión de voz",
    "Comprueba la conexión y vuelve a intentarlo.",
  ],
  provider_error: [
    "El servicio de voz no está disponible",
    "Inténtalo de nuevo en unos instantes.",
  ],
  output_limit: [
    "La respuesta se cortó",
    "La respuesta quedó incompleta. Puedes volver a preguntar.",
  ],
  turn_unconfirmed: [
    "No se pudo confirmar la respuesta",
    "Consulta su estado antes de volver a preguntar.",
  ],
  microphone_denied: [
    "Permite el acceso al micrófono",
    "Activa el permiso del micrófono en tu navegador y vuelve a intentarlo.",
  ],
  microphone_unavailable: [
    "No se encontró un micrófono disponible",
    "Comprueba el dispositivo y vuelve a intentarlo.",
  ],
  history_unavailable: [
    "No se pudo consultar esta sesión",
    "Vuelve a consultar los resultados.",
  ],
};

export function voiceProblem(
  code: VoiceProblemCode,
  retryAt?: number,
): VoiceProblem {
  const [title, message] = descriptions[code];
  return {
    code,
    title,
    message: retryAt
      ? `${message} Podrás volver a intentarlo a las ${new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(retryAt)}.`
      : message,
    severity:
      code === "output_limit" || code === "turn_unconfirmed"
        ? "warning"
        : "error",
  };
}
