import type { ApiRouter } from "@lazyfinance/rpc-api";
import { TRPCClientError } from "@trpc/client";
import { FirebaseError } from "firebase/app";
import { isCancelled } from "../rpc/rpc-error";

export type AuthAction = "signin" | "register" | "link" | "verify" | "reset";

/** Display policy only; email equality and error metadata never authorize linking. */
export function authErrorMessage(error: unknown, action: AuthAction): string {
  if (isCancelled(error))
    return "La sesión cambió. Vuelve a iniciar el proceso.";
  if (
    error instanceof TRPCClientError &&
    (error as TRPCClientError<ApiRouter>).data?.code === "CONFLICT"
  ) {
    return "No pudimos conectar esta identidad. Inicia sesión con tu método anterior; no combinamos cuentas por correo.";
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/account-exists-with-different-credential":
      case "auth/email-already-in-use":
        return "Si ya tienes una cuenta, inicia sesión con tu método actual y conecta el otro desde Acceso y seguridad.";
      case "auth/credential-already-in-use":
        return "Ese método pertenece a otra cuenta de Firebase. No combinamos cuentas ni sus datos automáticamente.";
      case "auth/provider-already-linked":
        return "Este método ya está conectado. Actualiza la página para revisar tus métodos de acceso.";
      case "auth/weak-password":
      case "auth/password-does-not-meet-requirements":
        return "La contraseña no cumple la política de seguridad. Prueba con una más larga y segura.";
      case "auth/invalid-email":
        return "Ingresa un correo electrónico válido.";
      case "auth/popup-blocked":
        return "Permite las ventanas emergentes y vuelve a pulsar el botón de Google.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Se canceló la ventana de Google. Puedes volver a intentarlo.";
      case "auth/requires-recent-login":
      case "auth/user-mismatch":
        return "Confirma de nuevo tu identidad con el método de acceso actual.";
      case "auth/too-many-requests":
        return "Hubo demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
      case "auth/operation-not-allowed":
        return "Este método de acceso no está disponible en el proyecto de Firebase.";
    }
  }

  const messages: Record<AuthAction, string> = {
    signin:
      "No pudimos iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.",
    register:
      "No pudimos completar el registro. Si la cuenta se creó, inicia sesión para reenviar la verificación.",
    link: "No pudimos confirmar la conexión. Revisa tus métodos antes de volver a intentarlo; no combinamos cuentas automáticamente.",
    verify:
      "No pudimos completar la verificación del correo. Inténtalo de nuevo.",
    reset: "No pudimos enviar el correo de recuperación. Inténtalo de nuevo.",
  };
  return messages[action];
}
