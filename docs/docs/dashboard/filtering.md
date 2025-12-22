---
sidebar_position: 3
---

# Filtering

NestLens provides comprehensive filtering capabilities with over 60 filter types to help you find exactly what you're looking for in your application's activity.

## Filter Types

### Common Filters

Available across multiple entry types:

#### Search
- **Full-text search** - Search across all text fields
- **Case-insensitive** - Matches regardless of case
- **Partial matching** - Finds substrings
- **Examples**: `user`, `error`, `timeout`

#### Tags
- **Tag filter** - Filter by custom or auto-generated tags
- **Multiple tags** - AND/OR logic support
- **Examples**: `production`, `slow-query`, `user-error`

#### Resolved Status
- **Resolved** - Show only resolved entries
- **Unresolved** - Show only unresolved entries
- **All** - Show both (default)

### Request Filters

Specific to HTTP request entries:

- **Methods** - GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
- **Paths** - Filter by URL path or pattern
- **Status Codes** - 200, 201, 400, 401, 403, 404, 500, etc.
- **Controllers** - Filter by controller name
- **IPs** - Client IP addresses
- **ERR** - Requests with no status code (errors before response)

### Query Filters

Database query specific filters:

- **Query Types** - SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER
- **Sources** - typeorm, prisma, mongoose, raw
- **Slow Queries** - Toggle to show only slow queries
- **Connections** - Filter by database connection name

### Exception Filters

Error and exception filters:

- **Names** - Exception class names (HttpException, ValidationError, etc.)
- **Methods** - HTTP method where exception occurred
- **Paths** - URL path where exception occurred
- **Resolved** - Filter by resolution status

### Log Filters

Application log filters:

- **Levels** - debug, log, warn, error, verbose
- **Contexts** - Logger context/category names

### Job Filters

Background job filters:

- **Queues** - Queue names (email, notifications, reports, etc.)
- **Statuses** - waiting, active, completed, failed, delayed
- **Job Names** - Specific job types

### Schedule Filters

Scheduled task filters:

- **Statuses** - started, completed, failed
- **Schedule Names** - Task identifiers

### Cache Filters

Cache operation filters:

- **Operations** - get, set, del, clear
- **Hit/Miss** - Cache hit or miss status

### Mail Filters

Email operation filters:

- **Statuses** - sent, failed
- **Recipients** - Email addresses
- **Subjects** - Email subject lines

### HTTP Client Filters

Outbound request filters:

- **Statuses** - HTTP status codes
- **Hostnames** - Target server hostnames
- **Methods** - GET, POST, PUT, DELETE, etc.

### Redis Filters

Redis command filters:

- **Commands** - get, set, del, hget, lpush, zadd, etc.
- **Statuses** - success, error
- **Key Patterns** - Redis key patterns

### Model Filters

ORM operation filters:

- **Actions** - find, create, update, delete, save
- **Entities** - Model/entity names
- **Sources** - typeorm, prisma

### Notification Filters

Notification filters:

- **Types** - email, sms, push, socket, webhook
- **Statuses** - sent, failed

### View Filters

Template rendering filters:

- **Formats** - html, json, xml, pdf
- **Statuses** - rendered, error

### Command Filters

CLI command filters:

- **Names** - Command identifiers
- **Statuses** - executing, completed, failed

### Gate Filters

Authorization filters:

- **Gate Names** - Permission/ability names
- **Results** - allowed, denied

### Batch Filters

Batch operation filters:

- **Operations** - Operation types
- **Statuses** - completed, partial, failed

### Dump Filters

Data operation filters:

- **Operations** - export, import, backup, restore, migrate
- **Formats** - sql, json, csv, binary
- **Statuses** - completed, failed

## Filter UI Components

### Filter Bar

The filter bar appears below the header and shows:
- Active filter badges
- "Clear all" button (when filters active)
- Filter dropdown menu
- Quick filter toggles

### Filter Badges

Each active filter displays as a badge:
```
Status: 500 ×    Method: POST ×    Slow: true ×
```

Click the × to remove individual filters.

### Filter Dropdown

Click "Filters" to open advanced filtering:
1. Select filter type from dropdown
2. Choose or enter filter value
3. Click "Apply" or press Enter
4. Filter badge appears in filter bar

### Quick Filters

Common filters have toggle buttons for quick access:
- **Slow Queries** - Toggle slow query filter
- **Errors Only** - Show only 4xx/5xx responses
- **Unresolved** - Show unresolved exceptions

## URL-Driven Filters

Filters are reflected in the URL query string:

```
/nestlens/requests?status=500&method=POST&path=/api/users
```

Benefits:
- **Bookmarkable** - Save filtered views
- **Shareable** - Send links to teammates
- **Browser Navigation** - Back/forward maintains filters
- **Deep Linking** - Link directly to filtered results

## Filter Combinations

Filters use AND logic by default:

```
status=500 AND method=POST AND path=/api/*
```

This means all conditions must match.

### Tag Filters

Tag filters support both AND and OR logic:

- **OR Logic** - Match any tag: `tag=error OR tag=critical`
- **AND Logic** - Match all tags: `tag=error AND tag=production`

Toggle between modes in the tag filter dropdown.

## Clear Filters

Remove all active filters:

1. **Clear All Button** - Click "Clear All" in filter bar
2. **Keyboard Shortcut** - Press `Ctrl+Shift+C`
3. **Navigation** - Click entry type in sidebar

## Filter Persistence

Filters persist during your session:

- **Session Storage** - Filters saved per entry type
- **Cleared on Refresh** - Fresh start on page reload
- **URL Takes Precedence** - URL params override saved filters

## Performance Considerations

Filters are applied at the database level for optimal performance:

- **Indexed Fields** - Common filters use database indexes
- **Efficient Queries** - Smart query generation
- **Pagination** - Results paginated automatically
- **No Client-Side Filtering** - All filtering server-side

## Filter Examples

### Find Failed Jobs in Specific Queue

```
Type: Jobs
Queue: email-queue
Status: failed
```

### Slow Database Queries

```
Type: Queries
Slow: true
Source: typeorm
```

### 500 Errors on API Endpoints

```
Type: Requests
Status: 500
Path: /api/*
```

### Unresolved Exceptions

```
Type: Exceptions
Resolved: false
```

### Redis Cache Misses

```
Type: Cache
Operation: get
Hit: false
```

## Next Steps

- Master [Keyboard Shortcuts](./keyboard-shortcuts.md) for faster filtering
- Learn about [Navigation](./navigation.md)
- Back to [Dashboard Overview](./overview.md)
