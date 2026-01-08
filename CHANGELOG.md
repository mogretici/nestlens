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
