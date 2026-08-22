import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { settleAsync } from 'src/_utils/settle';
import { EnvVariables } from 'src/config';
import { DRIZZLE_PG_CLIENT } from './drizzle.tokens';

export const drizzleProvider = [
  {
    provide: DRIZZLE_PG_CLIENT,
    inject: [ConfigService],
    useFactory: async (configService: ConfigService<EnvVariables, true>) => {
      const connectionString = configService.get('POSTGRES_URL', { infer: true });
      const pool = postgres(connectionString, {
        max: 10,
        idle_timeout: 30,
      });
      const pgClient = drizzle(pool);

      const { error } = await settleAsync(
        pgClient.execute('SELECT 1')
      );

      if (error) {
        throw new Error('failed to initialize postgres drizzle client');
      }

      return pgClient;
    },
  },
]


