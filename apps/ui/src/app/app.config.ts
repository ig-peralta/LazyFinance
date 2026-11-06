import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from "@angular/core";
import {
  provideClientHydration,
  withNoHttpTransferCache,
} from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { providePrimeNG } from "primeng/config";
import { routes } from "./app.routes";
import { initializeServices } from "./services/initializer";
import { Emerald } from "./themes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Never hydrate a different browser identity from another user's SSR API response.
    provideClientHydration(withNoHttpTransferCache()),
    provideAppInitializer(initializeServices),
    providePrimeNG({
      theme: {
        preset: Emerald,
      },
    }),
  ],
};
