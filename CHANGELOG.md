## [0.8.11](https://github.com/mogretici/nestlens/compare/v0.8.10...v0.8.11) (2026-08-12)


### Bug Fixes

* **watchers:** give back the methods they replaced ([3639108](https://github.com/mogretici/nestlens/commit/3639108daf85cd48ffea56540800c0300d758a3f))

## [0.8.10](https://github.com/mogretici/nestlens/compare/v0.8.9...v0.8.10) (2026-08-12)


### Bug Fixes

* attribute entries to the request that caused them ([b6e1d40](https://github.com/mogretici/nestlens/commit/b6e1d40e09e9dbb9cbd470c09d0c834adb066ed2))

## [0.8.9](https://github.com/mogretici/nestlens/compare/v0.8.8...v0.8.9) (2026-08-12)


### Bug Fixes

* **storage:** apply dashboard filters on Redis, and share one implementation ([4ec1f4e](https://github.com/mogretici/nestlens/commit/4ec1f4e7a357e407c7a1543034d9601c88710c97))

## [0.8.8](https://github.com/mogretici/nestlens/compare/v0.8.7...v0.8.8) (2026-08-12)


### Bug Fixes

* **core:** stop amplifying a storage outage inside the host application ([eebb021](https://github.com/mogretici/nestlens/commit/eebb02160ec30fbf4c58fe9d6ba80b831d5df3cb))
* **security:** mask fields whose names contain a sensitive term ([f5f66fe](https://github.com/mogretici/nestlens/commit/f5f66fe6193e9d9e457007e53dba482eee0b79e8))

## [0.8.7](https://github.com/mogretici/nestlens/compare/v0.8.6...v0.8.7) (2026-08-11)


### Bug Fixes

* **security:** stop reading X-Forwarded-For when no proxy is trusted ([fa76233](https://github.com/mogretici/nestlens/commit/fa7623368fedb9319d954ad3c853c96be1489249))

## [0.8.6](https://github.com/mogretici/nestlens/compare/v0.8.5...v0.8.6) (2026-08-11)


### Bug Fixes

* **storage:** keep booting when Redis cannot answer the rescore ([b439535](https://github.com/mogretici/nestlens/commit/b439535bec89da393f1af1091507c4a6e91f6ce9))
* **storage:** page Redis by sequence, not by save time ([c1ee1d3](https://github.com/mogretici/nestlens/commit/c1ee1d310f989581b0ce4899d0873f9ad6310d9a))

## [0.8.5](https://github.com/mogretici/nestlens/compare/v0.8.4...v0.8.5) (2026-08-11)


### Bug Fixes

* **dashboard:** match the SPA catch-all to the router in use ([a060d39](https://github.com/mogretici/nestlens/commit/a060d39ea3bf9670e6d8afd348f13032d3e04df2))

## [0.8.4](https://github.com/mogretici/nestlens/compare/v0.8.3...v0.8.4) (2026-08-11)


### Bug Fixes

* **package:** declare the express types and stop shipping unusable maps ([bc69c15](https://github.com/mogretici/nestlens/commit/bc69c15d02746e24edce1438326d90012f45aa7d))

## [0.8.3](https://github.com/mogretici/nestlens/compare/v0.8.2...v0.8.3) (2026-08-11)


### Bug Fixes

* **dashboard:** call useMemo before the early return in RelatedEntries ([08d2f1e](https://github.com/mogretici/nestlens/commit/08d2f1eaa10df45892a7edf636ae008c2aa6020e))
* **deps:** update dependencies with published advisories ([280998a](https://github.com/mogretici/nestlens/commit/280998a3d523be90319c87ba646db33fba3532c2))

## [0.8.2](https://github.com/mogretici/nestlens/compare/v0.8.1...v0.8.2) (2026-08-11)


### Bug Fixes

* **core:** reject a non-positive pruning interval or age ([190c10d](https://github.com/mogretici/nestlens/commit/190c10d3d028e2ee89984a218cb38beacf88dcf9))
* **storage:** read limit 0 the same way on every backend ([03764c4](https://github.com/mogretici/nestlens/commit/03764c4cfd5b622ed559cd1d96c6a4de5141c321))
* **storage:** report why Redis storage failed to start ([bc6d473](https://github.com/mogretici/nestlens/commit/bc6d473fde6ba988d23508d0e2da1f67dd4297fc))
* **watchers:** honour a capture size limit of zero ([93b891f](https://github.com/mogretici/nestlens/commit/93b891f4d9c213625a3c919bccb99b1a69a9d19c))

## [0.8.1](https://github.com/mogretici/nestlens/compare/v0.8.0...v0.8.1) (2026-08-11)


### Bug Fixes

* make the dev server reach the API, and the e2e suite mean something ([ac832ec](https://github.com/mogretici/nestlens/commit/ac832ec35024c555c0d4bed2afc5d936696ad3fb))

# [0.8.0](https://github.com/mogretici/nestlens/compare/v0.7.0...v0.8.0) (2026-08-10)


### Bug Fixes

* order entries deterministically when timestamps collide ([0ce9372](https://github.com/mogretici/nestlens/commit/0ce937227d4068c30437842dab5d11ecbddd8d45))
* track scheduled jobs on NestJS 9 and 10 ([02f485e](https://github.com/mogretici/nestlens/commit/02f485ee942958c43b112eac56d6a6e60f167350))


### Features

* remove deprecated configuration fields ([378aeed](https://github.com/mogretici/nestlens/commit/378aeedd1ef3693e8bc2fe98f3a3ad800110740a))
* serve NestLens's own responses outside the host's pipeline ([2207446](https://github.com/mogretici/nestlens/commit/2207446332298e4f0c821bdc8e508546349d9f1b))


### Performance Improvements

* let browsers cache the dashboard bundle ([f8f5565](https://github.com/mogretici/nestlens/commit/f8f556500965830057d42709ab4203b8bd3f6ed5))

# [0.7.0](https://github.com/mogretici/nestlens/compare/v0.6.2...v0.7.0) (2026-08-10)


### Features

* **dashboard:** real-time live-tail over SSE ([f53190e](https://github.com/mogretici/nestlens/commit/f53190eed6a96b7a0bb33daf1e5404bf348ad269))
* real-time entry stream powering SSE live-tail and webhook alerting ([eeda758](https://github.com/mogretici/nestlens/commit/eeda758049c19fcdeefdbe9f7f8b8bcc25bca983))

## [0.6.2](https://github.com/mogretici/nestlens/compare/v0.6.1...v0.6.2) (2026-08-10)


### Bug Fixes

* stop recording NestLens's own traffic behind a global prefix ([dfb8839](https://github.com/mogretici/nestlens/commit/dfb8839390524f9f339917b6170f0a6beb150e79))

## [0.6.1](https://github.com/mogretici/nestlens/compare/v0.6.0...v0.6.1) (2026-08-07)


### Bug Fixes

* keep the dashboard reachable under a global prefix ([bb62e4f](https://github.com/mogretici/nestlens/commit/bb62e4f09e302520e6b2928d7116c62928b6ee23)), closes [#10](https://github.com/mogretici/nestlens/issues/10)

# [0.6.0](https://github.com/mogretici/nestlens/compare/v0.5.2...v0.6.0) (2026-08-06)


### Features

* honour the configured path when mounting the dashboard and API ([2c58bae](https://github.com/mogretici/nestlens/commit/2c58baed91489475d0a7b8fe01ccb03271efbaff)), closes [#10](https://github.com/mogretici/nestlens/issues/10)


### ⚠️ Behaviour change — the REST API moved

`NestLensConfig.path` was documented as the base URL for the dashboard **and** its API, but nothing read it when mounting routes. It now works, which means the API sits under the configured prefix instead of the server root:

| | before | after (default `path`) |
|---|---|---|
| Dashboard | `/nestlens` | `/nestlens` — unchanged |
| REST API | `/__nestlens__/api/*` | `/nestlens/__nestlens__/api/*` |
| SSE stream | `/__nestlens__/stream` | `/nestlens/__nestlens__/stream` |

Nothing to do if you only use the dashboard. Update your URLs if you call the internal API directly:

```diff
- curl -X POST http://localhost:3000/__nestlens__/api/prune
+ curl -X POST http://localhost:3000/nestlens/__nestlens__/api/prune
```

Shipped as a minor rather than a major because the package is still pre-1.0, where [SemVer §4](https://semver.org/#spec-item-4) allows breaking changes without a major bump.

## [0.5.2](https://github.com/mogretici/nestlens/compare/v0.5.1...v0.5.2) (2026-08-06)


### Bug Fixes

* **dashboard:** make duration and number formatting deterministic ([c37ad7c](https://github.com/mogretici/nestlens/commit/c37ad7c3cf9f910670ff1d5410759e28c5006814))

## [0.5.1](https://github.com/mogretici/nestlens/compare/v0.5.0...v0.5.1) (2026-08-06)


### Bug Fixes

* stop importing @nestjs/swagger as an undeclared dependency ([213a766](https://github.com/mogretici/nestlens/commit/213a766950717056f886a968a5783595a8c6fd64))

# [0.5.0](https://github.com/mogretici/nestlens/compare/v0.4.2...v0.5.0) (2026-08-04)


### Features

* GraphQL headers & tags, entry search, and duplicate-package-safe API validation ([a735cf8](https://github.com/mogretici/nestlens/commit/a735cf8de75d3c35f9a57519493e767bbbbceb08))
* **graphql:** make masked request headers configurable ([60d1420](https://github.com/mogretici/nestlens/commit/60d1420a1cd7f1af5d3a685c7060ee702fb612be))

## [0.4.2](https://github.com/mogretici/nestlens/compare/v0.4.1...v0.4.2) (2026-06-30)


### Bug Fixes

* **http:** support the Fastify adapter, not just Express ([f303bce](https://github.com/mogretici/nestlens/commit/f303bcec66a08bed7e8aa61b406c228e23419948)), closes [#8](https://github.com/mogretici/nestlens/issues/8)
* **schedule:** auto-detect SchedulerRegistry via DiscoveryService ([3de8fe2](https://github.com/mogretici/nestlens/commit/3de8fe274747dac1e23b0bc37cc3edb8fdad4094)), closes [#7](https://github.com/mogretici/nestlens/issues/7)

## [0.4.1](https://github.com/mogretici/nestlens/compare/v0.4.0...v0.4.1) (2026-04-15)


### Bug Fixes

* **query:** wire TypeORM watcher through EntitySubscriber + Logger ([#6](https://github.com/mogretici/nestlens/issues/6)) ([36cc78d](https://github.com/mogretici/nestlens/commit/36cc78d69e894600725c1173e19027e2e55774c2)), closes [#5](https://github.com/mogretici/nestlens/issues/5)

# [0.4.0](https://github.com/mogretici/nestlens/compare/v0.3.5...v0.4.0) (2026-01-27)


### Features

* add BullMQ integration with setup methods and event handling ([42d155b](https://github.com/mogretici/nestlens/commit/42d155b221e2dd6bdda808c7561585f1ee616c98))
* add BullMQ integration with setup methods and event handling ([#4](https://github.com/mogretici/nestlens/issues/4)) ([67dc547](https://github.com/mogretici/nestlens/commit/67dc54787c6b05718a3451e728c434196825a04f))

## [0.3.5](https://github.com/mogretici/nestlens/compare/v0.3.4...v0.3.5) (2026-01-08)


### Bug Fixes

* update dashboard views and payload types for enhanced data handling ([6d1225e](https://github.com/mogretici/nestlens/commit/6d1225e30d27c9a35a7cc388d688d1924c634e2a))

## [0.3.4](https://github.com/mogretici/nestlens/compare/v0.3.3...v0.3.4) (2026-01-08)


### Bug Fixes

* add `tsc-alias` to build pipeline and update dependencies ([5f84677](https://github.com/mogretici/nestlens/commit/5f84677646f4e9a83660a74014f53a4db679d5b7))

## [0.3.3](https://github.com/mogretici/nestlens/compare/v0.3.2...v0.3.3) (2026-01-08)


### Bug Fixes

* enhance validation, exception handling, and package resolution ([0736a34](https://github.com/mogretici/nestlens/commit/0736a34a7f492ae844011d20f3f386193c26c563))

## [0.3.2](https://github.com/mogretici/nestlens/compare/v0.3.1...v0.3.2) (2026-01-08)


### Bug Fixes

* implement Mercurius auto-registration for GraphQL watcher ([6ef5092](https://github.com/mogretici/nestlens/commit/6ef50926109ae9edc1095db7d4aa0d914aa881ea))
* specify root option in sendFile to support pnpm package structure ([#2](https://github.com/mogretici/nestlens/issues/2)) ([ce92fdd](https://github.com/mogretici/nestlens/commit/ce92fddcf050930c2bf087a0a2bb8693ddde4a93))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.1](https://github.com/mogretici/nestlens/compare/v0.3.0...v0.3.1) (2026-01-03)


### Bug Fixes

* run sync-versions before commit via postbump hook ([811527d](https://github.com/mogretici/nestlens/commit/811527d104ce22ce936b95d4edd18ad7cab6b9a3))

## [0.3.0](https://github.com/mogretici/nestlens/compare/v0.2.0...v0.3.0) (2025-12-27)


### Features

* add GraphQL watcher, dashboard improvements, docs screenshots ([b414f25](https://github.com/mogretici/nestlens/commit/b414f25ff3b31836408eec8e23db8bed79cb1d2b))


### Bug Fixes

* handle non-HTTP contexts and improve exception handling ([f58ef0e](https://github.com/mogretici/nestlens/commit/f58ef0e0cfe79e549585720ff4c90bdf02232c3a))

## [0.2.1] - 2024-12-24

### Bug Fixes
- Handle non-HTTP contexts properly in request watcher
- Improve exception handling for edge cases

## [0.2.0] - 2024-12-23

### Features
- Add support for multiple storage drivers
  - **Memory Storage**: In-memory storage for development
  - **SQLite Storage**: Persistent storage with automatic pruning
  - **Redis Storage**: Distributed storage for production
- Comprehensive test suite for all storage drivers

## [0.1.2] - 2024-12-21

### Bug Fixes
- Include README and LICENSE files in npm package

## [0.1.1] - 2024-12-20

### Documentation
- Update README with badge links and improved installation instructions

## [0.1.0] - 2024-12-20

### Added
- Initial release
- 18 watchers for comprehensive monitoring:
  - Request Watcher - HTTP request tracking
  - Query Watcher - Database query monitoring (TypeORM, Prisma, Raw SQL)
  - Exception Watcher - Error tracking with stack traces
  - Log Watcher - Centralized log aggregation
  - Job Watcher - Bull/BullMQ queue monitoring
  - Cache Watcher - Cache operations tracking
  - Redis Watcher - Redis command monitoring
  - HTTP Client Watcher - Outgoing HTTP requests (Axios)
  - Mail Watcher - Email tracking
  - Event Watcher - Event emission monitoring
  - Schedule Watcher - Cron job tracking
  - Command Watcher - CLI command monitoring
  - Notification Watcher - Notification tracking
  - Gate Watcher - Authorization checks
  - View Watcher - Template rendering
  - Model Watcher - ORM model events
  - Dump Watcher - Debug dumps
  - Batch Watcher - Batch operations
- Beautiful React dashboard with dark mode
- Real-time auto-refresh
- Powerful filtering system
- Family tracking for related entries
- Automatic slow query detection
- Sensitive data masking
- SQLite storage with automatic pruning
- IP whitelist and custom authorization
- Cursor-based pagination for large datasets
- Comprehensive test suite (2300+ tests)

### Security
- Pagination limits to prevent DoS (max 1000 records)
- Input validation on all API endpoints
- Sensitive header and body masking
- Configurable access control
