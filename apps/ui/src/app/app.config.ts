import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration, withNoHttpTransferCache } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { Emerald } from './themes';
import { apiInterceptor } from './interceptors/api.interceptor';
import { initializeServices } from './services/initializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Never hydrate a different browser identity from another user's SSR API response.
    provideClientHydration(withNoHttpTransferCache()),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideAppInitializer(initializeServices),
    providePrimeNG({
      theme: {
        preset: Emerald,
      },
    }),
  ],
};
