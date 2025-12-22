# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
