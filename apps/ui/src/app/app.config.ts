import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { Emerald } from './themes';
import { apiInterceptor } from './interceptors/api.interceptor';
import { SessionService } from './services/session/session.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideAppInitializer(() => {
      const session = inject(SessionService);
      if (isPlatformServer(inject(PLATFORM_ID))) session.initServerSide();
      else session.initClientSide();
    }),
    providePrimeNG({
      theme: {
        preset: Emerald,
      },
    }),
  ],
};
