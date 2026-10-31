# LazyFinance UI

The UI is an Angular/TypeScript app with routing, server-side rendering (SSR), and client hydration. It is part of the [LazyFinance monorepo](../../README.md) alongside the [API](../api/README.md).

The interface uses PrimeNG components with an Aura-based emerald theme, Tailwind CSS v4 through PostCSS, and `tailwindcss-primeui` for styling utilities. Production builds include a browser bundle and a Node/Express SSR server.

## Development

Install dependencies from the [monorepo root](../../README.md), then start the UI:

```bash
pnpm install
pnpm --filter ui dev
```

Open <http://localhost:4200>. Angular's development server reloads as you edit. To run both apps with PostgreSQL, follow the [root development instructions](../../README.md#run-locally).

## Session and API requests

`initializeServices()` starts the session on the server or in the browser before routing. `SessionService` uses the local mock external identity provider in development and initializes Firebase Auth in the browser only when `AUTH_PROVIDER=firebase`. Both modes write a token-only cookie for SSR; each SSR request revalidates that token through `/auth/principal` before trusting its user. The cookie is not proof of authentication by itself. Angular's HTTP interceptor attaches the current token only to requests targeting the configured API origin. Development replaces `src/environments/environment.ts` with `src/environments/environment.development.ts` (local API at <http://localhost:3000>); production browser builds use <https://api.lazyfinance.cl>.

Both environment files contain placeholder public Firebase Web app identifiers (`apiKey`, `authDomain`, `projectId`, `appId`). Replace them with the values for the Firebase development or production project and enable Google sign-in plus the relevant authorized domains. The API uses the matching `FIREBASE_PROJECT_ID`; its Admin credentials are never included in the UI. Mock mode works without Firebase configuration or an emulator.

The dashboard can fetch account balances during SSR after token verification. Authenticated API responses are not transferred into browser hydration, and protected SSR responses are marked private and not cacheable. Set `API_INTERNAL_URL` on the UI server when it cannot reach the browser-facing API URL; the local Docker stacks use `http://api:3000`. Without the override, the server uses the same API URL as the browser.

## Commands

Run these from the monorepo root:

| Command | Purpose |
| --- | --- |
| `pnpm --filter ui dev` | Start the Angular development server on port `4200`. |
| `pnpm --filter ui build` | Build browser assets and the SSR server into `apps/ui/dist/ui`. |
| `pnpm --filter ui watch` | Build in watch mode with the development configuration. |
| `pnpm --filter ui test` | Run unit tests through Angular's Vitest-based test builder. |
| `pnpm --filter ui serve:ssr:ui` | Run the built SSR server (build first; default port `4000`). |
| `pnpm --filter ui ng <command>` | Pass a command to the Angular CLI; see the [Angular CLI reference](https://angular.dev/tools/cli). |

The Docker UI image runs the built SSR server on container port `4000`; the Compose stacks publish it on host port `4200`.
