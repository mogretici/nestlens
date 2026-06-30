---
sidebar_position: 2
---

# Navigation

The NestLens dashboard organizes the 19 entry types into logical groups in the sidebar, making it easy to find what you're looking for.

## Navigation Groups

The sidebar is grouped exactly as follows.

### Overview

- **Dashboard** - Aggregated metrics and recent activity

### Core

- **Requests** - All HTTP requests with method, path, status, and timing
- **Queries** - SQL and ORM queries with execution time
- **GraphQL** - GraphQL operations, fields, and N+1 detection
- **Exceptions** - Application errors and unhandled exceptions
- **Logs** - Application log messages (debug, info, warn, error)

### Background

- **Jobs** - Bull/BullMQ job queue processing
- **Schedule** - Cron jobs and scheduled tasks
- **Batches** - Batch processing operations
- **Commands** - CQRS command execution

### Data

- **Cache** - Cache get/set/delete operations
- **Redis** - Redis command execution
- **Models** - Entity CRUD operations (create, read, update, delete)

### Communication

- **HTTP Client** - Outbound HTTP requests made by your application
- **Mail** - Email sending operations
- **Notifications** - Push, SMS, and other notification types
- **Events** - Application event dispatching

### System

- **Views** - Template rendering operations
- **Gates** - Authorization and permission checks
- **Dumps** - Debug dump operations

## Navigation Behavior

### Active State

The currently selected entry type is highlighted in the sidebar with an accent color and an active indicator.

### Exception Badge

The **Exceptions** item shows a live count badge when unresolved exceptions exist. (Other items do not display a count badge.)

### Collapsible Groups

Navigation groups can be collapsed to save space:

- Click a group header to toggle it
- The collapsed/expanded state is persisted in `localStorage` and restored on the next visit

## Entry Type Pages

Each entry type has a dedicated page.

### List View

A table view showing key fields for quick scanning, status indicators, timestamps, and durations. Rows are keyboard-navigable (see [Keyboard Shortcuts](./keyboard-shortcuts.md)).

### Detail View

Clicking a row opens a dedicated detail page with:

- The complete payload
- Related entries grouped by request ID (family grouping)
- Tags
- Raw JSON view

## URL Structure

The dashboard uses clean, route-based URLs:

```
/nestlens/requests          # Request list
/nestlens/queries           # Query list
/nestlens/exceptions        # Exception list
/nestlens/requests/:id      # A single request's detail page
... and so on for each type
```

### Deep Linking

Filters are encoded in the URL query string, so filtered views are shareable and survive a refresh:

```
/nestlens/requests?status=500&method=POST
/nestlens/queries?slow=true
```

This enables bookmarking specific views, sharing filtered results, and using browser back/forward navigation.

## Keyboard Navigation

- **Arrow keys / Home / End** - Move between rows in a list
- **Enter / Space** - Open the focused entry
- **Ctrl/Cmd + K** - Clear all entries
- **Ctrl/Cmd + D** - Toggle dark mode
- See [Keyboard Shortcuts](./keyboard-shortcuts.md) for the full list

## Next Steps

- Learn about [Filtering Options](./filtering.md)
- Master [Keyboard Shortcuts](./keyboard-shortcuts.md)
- Back to [Dashboard Overview](./overview.md)
