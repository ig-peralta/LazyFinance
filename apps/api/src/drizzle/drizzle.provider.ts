import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { settleAsync } from 'src/_utils/settle';
import { DRIZZLE_PG_CLIENT } from './drizzle.tokens';
import { EnvironmentService } from 'src/environment/environment.service';
import * as schema from './schema';

export const drizzleProvider = [
  {
    provide: DRIZZLE_PG_CLIENT,
    inject: [EnvironmentService],
    useFactory: async (environment: EnvironmentService) => {
      const connectionString = environment.get('POSTGRES_URL');
      const pool = postgres(connectionString, {
        max: 10,
        idle_timeout: 30,
      });
      const pgClient = drizzle(pool, { schema });

      const { error } = await settleAsync(
        pgClient.execute('SELECT 1')
      );

      if (error) {
        throw new Error(
          'Failed to initialize postgres drizzle client',
          error
        );
      }

      return pgClient;
    },
  },
]


