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
cd example && npm start    # Run example NestJS app with NestLens
cd example && npm run seed # Generate test data via test-requests.sh
```

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
API Controller → InputValidator → Storage.getEntries(filter) → Response
```

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
