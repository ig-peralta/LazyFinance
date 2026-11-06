import { isPlatformServer } from "@angular/common";
import { inject, PLATFORM_ID } from "@angular/core";
import type { AuthConfig } from "@lazyfinance/contracts";
import { AuthApi } from "../core/auth/auth-api";
import { SessionService } from "../core/auth/session.service";
import { FirebaseService } from "./firebase/firebase.service";

function initializableServices() {
  return {
    api: inject(AuthApi),
    firebase: inject(FirebaseService),
    session: inject(SessionService),
  };
}

type Services = ReturnType<typeof initializableServices>;

async function authConfig(api: AuthApi): Promise<AuthConfig | null> {
  try {
    return await api.config();
  } catch {
    return null;
  }
}

export function initializeServices(): Promise<void> {
  // Resolve injections before awaiting; Angular's injection context is synchronous.
  const services = initializableServices();
  return isPlatformServer(inject(PLATFORM_ID))
    ? initializeServer(services)
    : initializeClient(services);
}

async function initializeServer(services: Services): Promise<void> {
  await services.session.initServerSide(await authConfig(services.api));
}

async function initializeClient(services: Services): Promise<void> {
  const config = await authConfig(services.api);

  if (config?.provider === "firebase") {
    // Session initialization fails closed if Firebase cannot start (e.g. placeholders).
    try {
      await services.firebase.init();
    } catch {
      /* The session clears its local state. */
    }
  }

  await services.session.initClientSide(config);
}
