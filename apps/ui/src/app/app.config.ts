import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from "@angular/core";
import {
  provideClientHydration,
  withNoHttpTransferCache,
} from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { providePrimeNG } from "primeng/config";
import { routes } from "./app.routes";
import { Emerald } from "./themes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Only public content is prerendered; never transfer protected RPC results.
    provideClientHydration(withNoHttpTransferCache()),
    providePrimeNG({
      theme: {
        preset: Emerald,
      },
    }),
  ],
};
