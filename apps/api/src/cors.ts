import type { INestApplication } from '@nestjs/common';

export function configureCors(app: INestApplication, allowedOrigins: string[]): void {
  app.enableCors({ origin: allowedOrigins });
}
