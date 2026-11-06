import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createTRPCClient, httpLink } from "@trpc/client";
import { AppModule } from "../src/app.module";
import { FirebaseAuthService } from "../src/auth/firebase/firebase-auth.service";
import { EnvironmentService } from "../src/environment/environment.service";
import { FixtureDatabase, testEnvironment } from "./persistence";

export async function identityApi(
  identities?: Map<string, VerifiedExternalIdentity>,
  provider: "firebase" | "mock" = "firebase",
) {
  const db = new FixtureDatabase();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvironmentService)
    .useValue(
      testEnvironment({
        AUTH_PROVIDER: provider,
        FIREBASE_PROJECT_ID:
          process.env.TEST_FIREBASE_PROJECT_ID ?? "lazyfinance-dev",
      }),
    );

  if (identities)
    builder.overrideProvider(FirebaseAuthService).useValue({
      verify: async (token: string) => {
        const identity = identities.get(token);
        if (!identity)
          throw new UnauthorizedException("Invalid Firebase ID token");

        return identity;
      },
    });

  const module = await builder.compile(),
    app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const client = (token?: string) =>
    createTRPCClient<ApiRouter>({
      links: [
        httpLink({
          url: `${url}/trpc`,
          headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
        }),
      ],
    });

  return {
    db,
    app,
    url,
    client,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
