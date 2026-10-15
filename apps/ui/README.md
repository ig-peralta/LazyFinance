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

`SessionService` restores its session cookie during SSR and browser initialization. It exposes the bearer token as a signal and can set or clear the cookie; the cookie is a transport for SSR state, not proof that the API accepted the token. Angular's HTTP interceptor attaches that token only to requests targeting `environment.apiUrl`. Development replaces `src/environments/environment.ts` with `src/environments/environment.development.ts` (local API at <http://localhost:3000>); production builds use <https://api.lazyfinance.cl>.

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
