# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
