# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestLens is a Laravel Telescope-inspired debugging and monitoring tool for NestJS. It provides real-time tracking of requests, queries, exceptions, jobs, and 17+ other watchers through a web dashboard.

## Commands

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
npm test                   # Run Jest unit tests
npm test -- --watch        # Watch mode
npm test -- path/to/file   # Run single test file

# E2E tests (Playwright)
npm run test:e2e           # Run all e2e tests
npm run test:e2e:ui        # Run with Playwright UI
npm run test:e2e:headed    # Run in headed browser mode
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
cd example && npm run seed # Generate test data via test-requests.sh
```

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

## Architecture

### Monorepo Structure
- `src/` - NestJS library (TypeScript, CommonJS)
- `dashboard/` - React SPA (Vite, TypeScript, Tailwind)
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
- DTOs use class-validator for input validation

### Dashboard (`dashboard/src/`)
- React 18 with React Router for navigation
- Fetches data from `/nestlens/__nestlens__/entries` API
- Components in `components/`, pages in `pages/`
- Types mirror backend Entry types in `types.ts`

### Module Registration
`NestLensModule.forRoot(config)` in `nestlens.module.ts`:
1. Creates `NestLensCoreModule` (global, provides storage/collector)
2. Conditionally registers watchers based on config
3. Request/Exception watchers use `APP_INTERCEPTOR`/`APP_FILTER` globals

## Key Patterns

### Entry Collection Flow
```
Watcher → CollectorService.collect(entry) → DataMasker → Storage
```

### Storage Query Flow
```
API Controller → NestLensValidationPipe (DTO) → Storage.getEntries(filter) → Response
```
Query parameters are validated and transformed by the DTOs in `src/api/dto/`.
The limits — 100 values per filter, 500 characters of search, 1000 entries per
page — live with the validators the filters already run through.

### Configuration
All config is in `nestlens.config.ts`. Main config interface: `NestLensConfig`.
Watchers can be enabled with boolean or detailed config object.

### GraphQL Watcher Integration
GraphQL monitoring is zero-config. When `watchers.graphql` is enabled, `NestLensModule`
detects the GraphQL server and auto-registers the watcher:
- **Apollo** (`@nestjs/apollo` / `@apollo/server`): `NestLensApolloPlugin` is added as a
  provider (`nestlens.module.ts:97-99`) and auto-discovered by Apollo's
  `PluginsExplorerService` via a dynamic `@Plugin()` decorator.
- **Mercurius** (`mercurius` / `@nestjs/mercurius`): `MercuriusAutoRegistrar` hooks in
  during `onApplicationBootstrap` (`nestlens.module.ts:101-103`).

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

- Unit tests use Jest with ts-jest preset
- Test setup in `src/__tests__/setup.ts`
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
- Lint, type check, library tests and dashboard tests run on every push and
  pull request (`.github/workflows/ci.yml`) — about two minutes
- E2E (`.github/workflows/e2e.yml`) runs chromium plus the production project on
  any pull request touching `src/api/`, `dashboard/`, `e2e/` or `example/`, and
  on pushes to main. All three browsers run nightly at 03:00 UTC. Actions tab →
  **E2E** → *Run workflow* still runs it on demand, with `all` as a browser
  option.
- It used to be manual only, on the grounds that it is slow on a two-core
  runner. It has since caught a blank dashboard, a crash in the entry detail
  page and a deep link that stopped resolving, none of which the unit tests saw
  — so chromium and the built package are worth the wait, and firefox and webkit
  earn their time overnight.
