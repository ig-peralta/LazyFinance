import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_URL } from './tokens/api-url';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: API_URL, useFactory: () => process.env['API_INTERNAL_URL'] || environment.apiUrl },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
