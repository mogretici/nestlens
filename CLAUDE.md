# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestLens is a Laravel Telescope-inspired debugging and monitoring tool for NestJS. It provides real-time tracking of requests, queries, exceptions, jobs and more — 19 watchers in all, one per entry type in `ENTRY_TYPES` — through a web dashboard.

## Commands

### npm
Every `package.json` with a lockfile pins **npm 11.21.3** (`packageManager`
and `devEngines`, exact). npm 10.9 and later refuse every command — `npm ci`,
`npm run`, `npm test`, the husky hooks — with `EBADDEVENGINES` under any other
version; npm 10.8 (Node 20's) does not check. Install it with
`npm install --global npm@11.21.3`, or without touching the global npm:
```bash
npm install --global --prefix /tmp/npm-11.21.3 npm@11.21.3
export PATH=/tmp/npm-11.21.3/bin:$PATH
```
CONTRIBUTING.md has the per-platform ways. npm scripts run the npm in
`node_modules/.bin`, which the root `overrides` hold to the same version.

CI jobs set Node up through `.github/actions/setup-node`, never
`actions/setup-node` directly: it installs the pinned npm, then restores the
cache (setup-node's own cache step runs the bundled npm and fails on
`devEngines`). `src/__tests__/pinned-npm.spec.ts` enforces both, and that the
four manifests, the lockfile's `node_modules/npm` and CONTRIBUTING.md agree.

### Build
```bash
npm run build              # Build library + dashboard
npm run build:lib          # Build library only (TypeScript)
npm run build:dashboard    # Build React dashboard
```

### Development
```bash
npm run dev                # Watch mode for library
cd dashboard && npm run dev  # Run dashboard dev server (Vite)
```

### Testing
```bash
npm test                   # Run the library's unit tests (Vitest)
npm run test:watch         # Watch mode
npm test -- path/to/file   # Run single test file
npm test -- --coverage     # With coverage (V8), written to coverage/

# E2E tests (Playwright)
npm run test:e2e           # Run all e2e tests
npm run test:e2e:ui        # Run with Playwright UI
npm run test:e2e:headed    # Run in headed browser mode
```

### Benchmarks
```bash
npm run build:lib          # Required first — benchmarks run against dist/
npm run benchmark          # Serial latency, memory per entry, write throughput
npm run benchmark:load     # 32 concurrent connections, server in its own
                           # process: throughput, CPU per 1k requests, RSS,
                           # idle CPU. This is the one that answers "can I
                           # leave NestLens on in production".
npm run benchmark:sanitizer # GraphQL sanitizer and the response size probe
```

`benchmark:load` prints an `entries` column on purpose: a configuration that
recorded nothing once looked like the fastest one on the table.

To profile, run the benchmark server on its own and point Node at it:
```bash
node --cpu-prof scripts/benchmark-load-server.mjs 4201 '{}'
```

### Linting
```bash
npm run lint               # ESLint on src/**/*.ts
```

### Example App
```bash
npm run build              # Required first — the example installs dist/, not src/
cd example && rm -rf node_modules/nestlens && npm install   # After every rebuild
cd example && npm start    # Run example NestJS app with NestLens
cd example && ./test-requests.sh  # Generate test data for every entry type; needs the app
                                   # running, curl and python3. Args: [base URL] [mount path]
cd example && npm test     # Example's own Vitest specs (`unit` project, src/**/*.spec.ts)
cd example && npm run test:e2e     # Boots AppModule in-process (`e2e` project, test/)
```

The example has its own `vitest.config.mts`, built like the library's: SWC
through `unplugin-swc`, and `resolve.extensions` with `.js` before `.mjs`
(`example/src/one-graphql.spec.ts` fails without it). CI does not run these
specs; the Playwright suite is what drives the example there.

The example installs NestLens from `file:..` as a **copy**, not a symlink
(`example/.npmrc` sets `install-links=true`). A symlink makes Node load
`@nestjs/core` twice — once from the repo root, once from `example/` — and the
app dies at bootstrap with `Nest can't resolve dependencies of DiscoveryService
(ModulesContainer)`. The cost is that library changes only reach the example
after a rebuild plus `npm install`.

**`npm install` alone is not enough.** npm treats the `file:` dependency as
already satisfied and leaves the old copy in place, so the example keeps
running whatever version was installed first — it was found sitting three
releases behind, which silently made every E2E run test stale code. Delete
`example/node_modules/nestlens` first.

**A running example has to be restarted.** `DashboardController` reads the
built dashboard once, at bootstrap, so a rebuilt bundle reaches a live server
only after `npm start` runs again. Measuring a dashboard change against a
server that was already up reports the previous build — three times in one
session, each time looking like the fix had not worked.

## Architecture

### Monorepo Structure
- `src/` - NestJS library (TypeScript, CommonJS)
- `dashboard/` - React SPA (Vite, TypeScript, Tailwind CSS 4)
- `example/` - Demo NestJS app for testing
- `e2e/` - Playwright end-to-end tests
- `docs/` - Docusaurus documentation site

### Core Components (`src/core/`)
- **CollectorService** - Central service that receives entries from watchers and stores them
- **StorageInterface** - Abstract storage layer with implementations:
  - `MemoryStorage` (default, zero-config)
  - `SqliteStorage` (requires better-sqlite3)
  - `RedisStorage` (requires ioredis)
- **TagService** - Manages entry tagging and tag-based queries
- **FamilyHashService** - Groups related entries (e.g., queries for a request)
- **PruningService** - Automatic cleanup of old entries

### Watchers (`src/watchers/`)
Each watcher monitors a specific aspect of the application:
- **Request/Exception/Log/Query** - Core watchers (enabled by default)
- **GraphQL** (`graphql/`) - Multi-file module with N+1 detection, subscription tracking
- **Job/Schedule/Event/Batch** - Background task watchers
- **Cache/Redis/Model** - Data layer watchers
- **HttpClient/Mail/Notification** - External communication watchers
- **Command/Gate/View/Dump** - Utility watchers

Watchers create `Entry` objects via CollectorService. Entry types are defined in `src/types/`.

### API Layer (`src/api/`)
- **NestLensApiController** - REST endpoints for dashboard (`__nestlens__/*`)
- **DashboardController** - Serves React SPA with catch-all route
- **NestLensGuard** - Authorization (IP whitelist, role-based, custom function)
- **`@NestLensTool`** (`src/api/tools/`) - Marks a handler as a tool for AI agents. `GET .../api/tools` builds the manifest from the controllers' metadata and the DTOs' validators, and `src/mcp/` (the `nestlens-mcp` binary, `nestlens/mcp`) is a hub over it, so a decorated endpoint needs no change in the MCP server. `tool-coverage.spec.ts` fails for an undecorated route
- DTOs use class-validator for input validation

### Dashboard (`dashboard/src/`)
- React 18 with React Router for navigation
- Fetches data from `/nestlens/__nestlens__/api/*` (the mount point, then the API prefix, then `api`)
- Components in `components/`, pages in `pages/`
- Types mirror backend Entry types in `types.ts`
- Styling is Tailwind CSS 4 through `@tailwindcss/vite`, configured in CSS:
  `src/index.css` holds the theme, the dark variant and the base styles, and
  there is no `tailwind.config.js` or PostCSS config. `src/tailwind3-defaults.css`
  keeps Tailwind 3's palette, font and line heights, so the move to 4 left the
  dashboard looking as it did; removing it is a visible redesign, not a cleanup.
- A variant on a pseudo-element is lost without a warning: `@apply dark:…` on
  `::-webkit-scrollbar-thumb` becomes `::-webkit-scrollbar-thumb:is(.dark *)`,
  which is not a valid selector; Lightning CSS empties it to `:is()` and the
  minified build drops the rule. Write those selectors in plain CSS
  (`stylesheet.spec.ts` checks every stylesheet under `src/`). Playwright's
  headless Chromium hides scrollbars, so only WebKit screenshots show them.
- `npm run typecheck` covers the app and `vite.config.ts`; a bare `tsc` reads
  only the first.

### Module Registration
`NestLensModule.forRoot(config)` in `nestlens.module.ts`:
1. Creates `NestLensCoreModule` (global, provides storage/collector)
2. Registers the request, exception and query watchers when enabled,
   and every opt-in watcher (`OPT_IN_WATCHERS`) always — exported from a global
   module so a service can take one by constructor for its manual API. A watcher
   that is off installs nothing and its manual methods are no-ops; with
   `enabled: false` they are inert instances. `undefined` anywhere in the
   config means not configured (`withoutUndefined` in `mergeConfig`), so the
   default stands
3. Request/Exception watchers use `APP_INTERCEPTOR`/`APP_FILTER` globals
4. A watcher handed a host under a token (`NESTLENS_GATE_SERVICE`, …, and
   `CACHE_MANAGER`) takes the injected value or, failing that, resolves every
   provider of it across the container in `onModuleInit` (`attachHosts` in
   `src/watchers/host-token.ts`, `get(token, { strict: false, each: true })`),
   so the token can be provided in any module. A further
   host gets a sibling watcher; a host is marked so a second
   `NestLensModule.forRoot()` does not wrap it again. Request- or
   transient-scoped hosts are refused with a warning
5. `NestLensLogger` is always provided and exported (inert with `enabled: false`)

## Key Patterns

### Entry Collection Flow
```
Watcher → CollectorService.collect(entry) → DataMasker → Storage
```

### Storage Query Flow
```
API Controller → NestLensValidationPipe (DTO) → Storage.findWithCursor(params) → Response
```
Query parameters are validated and transformed by the DTOs in `src/api/dto/`.
100 values per filter and 500 characters of search are validators, so going over
is a `400`; 1000 entries per page is a transformer, `TransformLimit`, so a larger
`limit` is clamped to it and an unreadable one becomes the default of 50. Both
live in `src/api/dto/transformers/`.

### Configuration
All config is in `nestlens.config.ts`. Main config interface: `NestLensConfig`.
Watchers can be enabled with boolean or detailed config object.

### GraphQL Watcher Integration
GraphQL monitoring is zero-config. When `watchers.graphql` is enabled, `NestLensModule`
detects the GraphQL server and auto-registers the watcher:
- **Apollo** (`@nestjs/apollo` / `@apollo/server`): `NestLensApolloPlugin` is added as a
  provider in `NestLensCoreModule.forRoot` and auto-discovered by Apollo's
  `PluginsExplorerService` via a dynamic `@Plugin()` decorator.
- **Mercurius** (`mercurius` / `@nestjs/mercurius`): `MercuriusAutoRegistrar` hooks in
  during `onApplicationBootstrap`, registered in the same place.

```typescript
// Just enable the watcher — no manual plugin wiring needed:
@Module({
  imports: [
    NestLensModule.forRoot({ watchers: { graphql: true } }),
    GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true }),
  ],
})
export class AppModule {}
```

`GraphQLWatcher.getPlugin()` still exists for manual wiring in non-standard setups, but
it is no longer required for Apollo or Mercurius.

## Testing Notes

- Unit tests run on Vitest (`vitest.config.mts`); specs import `describe`,
  `it`, `expect` and `vi` from `vitest` — there are no globals, and
  `tsconfig.json` sets `"types": ["node"]` so an installed `@types/*` package
  that declares test globals is not pulled in automatically and cannot make a
  missing import compile
- Test setup in `src/__tests__/setup.ts`: reflect-metadata, the loopback listen
  guard, and `vi.clearAllMocks()` after each test (not `clearMocks: true`, which
  clears *before* each test and erases calls a `beforeAll` made)
- Specs are compiled by SWC (`unplugin-swc`, the compiler NestJS documents for
  Vitest), which reads `experimentalDecorators`, `emitDecoratorMetadata`,
  `target` and `useDefineForClassFields` from `tsconfig.json`. The last one is
  set explicitly to `false`: it is already `tsc`'s default for ES2021, but SWC
  defaults to define semantics, and the suite would then test class fields the
  package does not ship
- `vi.mock` reaches `import` and `import()`, not `require()`. NestLens loads its
  optional peers (graphql, `@nestjs/cache-manager`, bullmq, the platform
  packages) with a runtime `require()`, so mocking one of those does nothing to
  NestLens — test those paths against the real package or through code that
  imports
- A `vi.mock` factory that throws has its error wrapped by Vitest, without the
  original `code`. To simulate a missing module, return a module whose
  constructor or function throws the `MODULE_NOT_FOUND` error instead
  (`storage-open-failure.spec.ts`, `storage.factory.spec.ts`)
- `mockImplementation()` with no argument calls the original in Vitest; write
  `mockImplementation(() => undefined)` to silence a spy. A `vi.fn` called with
  `new` constructs with the mock as `new.target`, so a class given to
  `mockImplementation` loses its prototype methods — use instance fields
- `resolve.extensions` lists `.js` before `.mjs`, as Node resolves an
  extensionless `main`. Vite's default order loaded graphql twice — `index.mjs`
  for an import, `index.js` for NestLens' `require('graphql')`.
  `one-copy-per-package.spec.ts` fails if that comes back
- `pool: 'forks'` with Vitest's default per-file isolation. Suites mutate
  `process.env`, load better-sqlite3's native addon and patch
  `net.Server.prototype`; `isolate: false` measured about 2.5× faster and failed
  5 to 22 tests per run, different ones each time, through state shared
  between files
- There is no `isolateModules`. A second copy of a package — what a host
  application with its own `node_modules` has — is a real one: copy the package
  into a temporary `node_modules` and load it with `createRequire`
  (`host-validation-pipe.integration.spec.ts`)
- E2E tests require both example app (port 3000) and dashboard dev server (port 5173)
- Playwright config auto-starts both servers in non-CI mode
- Before the first E2E run: `npm run build`, then
  `cd example && rm -rf node_modules/nestlens && npm install`, then
  `npx playwright install`
- The `chromium` / `firefox` / `webkit` projects load the dashboard from the
  **Vite dev server**, so they never exercise what the package ships. The
  `production` project (`--project=production`) runs
  `e2e/tests/production-serving.spec.ts` against the example app instead,
  covering static file serving, the injected `<base href>`, the SPA wildcard,
  cache headers and asset integrity. Run it whenever
  `dashboard.controller.ts` changes — it needs a fresh build and example
  install to mean anything.
- That project stays deliberately small. Playwright gives each test a cold
  cache, so re-running the functional suite there would re-download the ~1 MB
  bundle per test to re-cover what the dev-server projects already cover, and
  those specs assume the dashboard sits at the origin root. What only the
  production project can check is that the bytes leaving the package are
  correct — 0.8.0 served every script as `{"type":"Buffer","data":[…]}` and
  not one existing test noticed.
- The Redis-backed suites are skipped unless `REDIS_URL` is set (CI sets one
  up as a service). They run locally against any Redis:
  `REDIS_URL=redis://127.0.0.1:6379 npm test`. They use database 12 and 13 with
  a `nestlens-*-test:` key prefix and delete their own keys afterwards, so they
  are safe against a Redis holding something else — but they are the only thing
  that exercises `redis.storage.ts`, and running without them leaves a
  supported backend measured only by its unit tests.
- `npm run test:smoke` installs the **published** package into a throwaway
  project, boots a real NestJS application against it and checks the dashboard,
  an asset and the API. `--tarball <path>` runs it against a local
  `npm pack` output before publishing. It runs automatically after every
  release (`.github/workflows/release.yml`); nothing else in the repository
  tests what npm actually serves, which is how 0.8.0 shipped a dashboard that
  was blank in a browser with every suite green.
- Lint, type check, **build**, library tests and dashboard tests run on every
  push and pull request (`.github/workflows/ci.yml`) — about two minutes. The
  build step is not optional: five integration suites serve the real bundle and
  skip themselves when `dist/dashboard/public/index.html` is missing, and
  without it 54 tests skipped in CI and nowhere else — the ones covering the
  dashboard arriving as HTML rather than as a JSON string, which is the failure
  that shipped in 0.8.0
- E2E (`.github/workflows/e2e.yml`) runs chromium plus the production project on
  any pull request touching `src/`, `dashboard/`, `e2e/`, `example/` or
  `package.json`, and on pushes to main. The filter used to name `src/api/`
  alone; what the suite drives is the example application, which runs the whole
  library, and on one branch of forty-five commits thirty changed none of the
  listed paths — including the Redis rewrite and the watcher wrapping fix,
  which are exactly the changes that produce a blank dashboard. All three browsers run nightly at 03:00 UTC. Actions tab →
  **E2E** → *Run workflow* still runs it on demand, with `all` as a browser
  option.
- It used to be manual only, on the grounds that it is slow on a two-core
  runner. It has since caught a blank dashboard, a crash in the entry detail
  page and a deep link that stopped resolving, none of which the unit tests saw
  — so chromium and the built package are worth the wait, and firefox and webkit
  earn their time overnight.
