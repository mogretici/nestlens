---
sidebar_position: 2
---

# Navigation

The NestLens dashboard uses a hierarchical navigation structure to organize the 18 different entry types into logical groups, making it easy to find what you're looking for.

## Navigation Groups

### Web Group

HTTP-related activities and web traffic monitoring.

- **Requests** - All HTTP requests with method, path, status, and timing
- **Exceptions** - Application errors and unhandled exceptions
- **HTTP Client** - Outbound HTTP requests made by your application

### Database Group

Database operations and ORM activity tracking.

- **Queries** - SQL and ORM queries with execution time
- **Models** - Entity CRUD operations (create, read, update, delete)

### Background Group

Asynchronous operations and scheduled tasks.

- **Jobs** - Bull/BullMQ job queue processing
- **Schedules** - Cron jobs and scheduled tasks
- **Batches** - Batch processing operations
- **Commands** - CLI command execution
- **Dumps** - Data import/export operations

### Communication Group

External communication and messaging.

- **Mail** - Email sending operations
- **Notifications** - Push, SMS, and other notification types
- **Events** - Application event dispatching

### Infrastructure Group

System infrastructure and caching.

- **Cache** - Cache get/set/delete operations
- **Redis** - Redis command execution
- **Gates** - Authorization and permission checks

### System Group

System-level operations and logging.

- **Logs** - Application log messages (debug, info, warn, error)
- **Views** - Template rendering operations

## Navigation Behavior

### Active State

The currently selected entry type is highlighted in the navigation sidebar with:
- Bold text
- Accent color background
- Left border indicator

### Entry Counts

Each navigation item displays a real-time count badge showing the number of entries:
- Appears only when entries exist
- Updates automatically as new entries arrive
- Helps identify active areas of your application

### Collapsible Groups

Navigation groups can be collapsed to save space:
- Click the group header to toggle
- State persists across page refreshes
- Useful for focusing on specific areas

## Entry Type Pages

Each entry type has a dedicated page with:

### List View

A table or card view showing:
- Key fields for quick scanning
- Status indicators (success, error, slow, etc.)
- Timestamp and duration
- Quick action buttons

### Detail Modal

Click any entry to open a detailed view with:
- Complete payload data
- Related entries (via request ID)
- Tags and family grouping
- Raw JSON export option

## URL Structure

The dashboard uses clean URLs for navigation:

```
/nestlens/requests          # All requests
/nestlens/queries           # All queries
/nestlens/exceptions        # All exceptions
/nestlens/logs              # All logs
... and so on for each type
```

### Deep Linking

URLs support filters and pagination:

```
/nestlens/requests?status=500&method=POST
/nestlens/queries?slow=true
/nestlens/exceptions?resolved=false
```

This allows:
- Bookmarking specific views
- Sharing filtered results with team members
- Browser back/forward navigation

## Search Across Types

The global search box searches across all entry types:

1. Enter search term in the header search box
2. Results show matching entries from all types
3. Click any result to view full details
4. Search supports:
   - Partial text matching
   - Case-insensitive search
   - Searches across multiple fields (URL, message, query, etc.)

## Breadcrumb Navigation

The header shows your current location:

```
NestLens > Web > Requests > Request #12345
```

Click any breadcrumb to navigate back:
- **NestLens** - Returns to dashboard home
- **Web** - Shows all web-related entries
- **Requests** - Returns to request list

## Quick Navigation

### Recently Viewed

The dashboard remembers your last 10 visited pages for quick access via a dropdown menu in the header.

### Favorites (Coming Soon)

Pin frequently accessed views for one-click access.

## Keyboard Navigation

Navigate the dashboard efficiently with keyboard shortcuts:

- **Arrow Keys** - Move between entries in list view
- **Enter** - Open selected entry details
- **Escape** - Close detail view
- **Ctrl+K** - Focus search box
- **See all shortcuts** in [Keyboard Shortcuts](./keyboard-shortcuts.md)

## Next Steps

- Learn about [Filtering Options](./filtering.md)
- Master [Keyboard Shortcuts](./keyboard-shortcuts.md)
- Back to [Dashboard Overview](./overview.md)
