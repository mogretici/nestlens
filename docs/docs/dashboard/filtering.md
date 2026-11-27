---
sidebar_position: 3
---

# Filtering

The API accepts 50 filter parameters, and the dashboard reaches them from the
header, the search box and the values in each table.

## Filter Types

Each filter is named below by its query parameter. A list parameter takes
several comma-separated values and matches an entry having **any** of them;
"contains" means a substring match that ignores case, and anything else is an
exact match.

### Common Filters

Available on every list:

- **Search** (`search`) - Contains, across the entry's payload and its tags;
  at most 500 characters
- **Tags** (`tags`) - An entry carrying any of the tags, ignoring case. Every
  tag at once is the [tag endpoint's](#tag-filters) `logic=AND`, not this filter
- **Resolved** (`resolved`) - `true` or `false`; the Exceptions page's
  **All / Unresolved / Resolved** tabs set it
- **Time window** (`window`) - **Any time** (default), **Last 5 minutes**,
  **Last 15 minutes**, **Last hour**, **Last 24 hours**, as `window=5m`. Relative,
  not fixed: measured from the moment of each request, so a page left open keeps
  showing the last five minutes rather than the five minutes around when you
  chose it
- **Duration** (`slower`) - **Any duration** (default), **Over 100ms**,
  **Over 500ms**, **Over 1s**, **Over 5s**, as `slower=500`. Offered on every
  list whose entries record how long they took — everything except exceptions
  and logs, which measure nothing
- **From / To** (`from`) - API only: `from` and `to`, ISO 8601 instants; the
  dashboard's `window` becomes a `from`
- **Duration bounds** (`minDuration`) - API only: `minDuration` and
  `maxDuration` in milliseconds; the dashboard's `slower` becomes a
  `minDuration`, and an entry that measures nothing never matches either
- **Request** (`requestId`) - API only: everything one request produced, which
  is what an entry's detail page shows

### Request Filters

- **Methods** (`methods`) - GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD; also
  matches an exception by the method of the request that threw it, and an
  outgoing HTTP call by its own
- **Paths** (`paths`) - Contains, or with `*` a pattern the whole path must
  match: `/api/*` is "starts with /api/". Also matches an exception by its
  request's URL
- **Status Codes** (`statuses`) - 200, 201, 400, 401, 403, 404, 500, …, and `ERR`
  for a request that ended with no status code. Also matches outgoing HTTP calls
- **Controllers** (`controllers`) - `UsersController.findAll`: the controller
  and handler that answered
- **Hostnames** (`hostnames`) - Contains, against the `Host` header — or, for an
  outgoing call, the host it went to
- **IPs** (`ips`) - Client IP addresses

### Query Filters

- **Query Types** (`queryTypes`) - SELECT, INSERT, UPDATE, DELETE, CREATE,
  DROP, ALTER: what the statement starts with
- **Sources** (`sources`) - `typeorm` or `prisma`, the two the watcher records
- **Slow Queries** (`slow`) - `true` for queries over the watcher's
  `slowThreshold`

### Exception Filters

- **Names** (`names`) - Contains, against the exception's class name
  (`HttpException`, `ValidationError`, …)
- **Methods** (`methods`) - The HTTP method of the request that threw
- **Paths** (`paths`) - The URL of the request that threw
- **Resolved** (`resolved`) - Resolution status

### Log Filters

- **Levels** (`levels`) - debug, log, warn, error, verbose
- **Contexts** (`contexts`) - Logger context names

### Event Filters

- **Event Names** (`eventNames`) - Contains, against the event name:
  `order` finds `order.created` and `order.shipped`

### Job Filters

- **Queues** (`queues`) - Queue names
- **Statuses** (`jobStatuses`) - waiting, active, completed, failed, delayed
- **Job Names** (`jobNames`) - Contains, against the job's name

### Schedule Filters

- **Statuses** (`scheduleStatuses`) - started, completed, failed
- **Schedule Names** (`scheduleNames`) - Contains, against the task's name

### Cache Filters

- **Operations** (`cacheOperations`) - get, set, del, clear

### Mail Filters

- **Statuses** (`mailStatuses`) - sent, failed

### HTTP Client Filters

- **Statuses** (`statuses`) - HTTP status codes, `ERR` for a call that got none
- **Hostnames** (`hostnames`) - Contains, against the target host
- **Methods** (`methods`) - GET, POST, PUT, DELETE, …

### Redis Filters

- **Commands** (`redisCommands`) - `get`, `set`, `del`, `hget`, `lpush`, `zadd`,
  …, as the watcher records them: lower case
- **Statuses** (`redisStatuses`) - success, error

### Model Filters

- **Actions** (`modelActions`) - find, create, update, delete, save
- **Entities** (`entities`) - Model/entity names
- **Sources** (`modelSources`) - typeorm, prisma

### Notification Filters

- **Types** (`notificationTypes`) - email, sms, push, socket, webhook
- **Statuses** (`notificationStatuses`) - sent, failed

### View Filters

- **Formats** (`viewFormats`) - html, json, xml, pdf
- **Statuses** (`viewStatuses`) - rendered, error

### Command Filters

- **Names** (`commandNames`) - Contains, against the command's name
- **Statuses** (`commandStatuses`) - executing, completed, failed

### Gate Filters

- **Gate Names** (`gateNames`) - Contains, against the gate name
- **Results** (`gateResults`) - allowed, denied

### Batch Filters

- **Operations** (`batchOperations`) - Operation types
- **Statuses** (`batchStatuses`) - completed, partial, failed

### Dump Filters

- **Operations** (`dumpOperations`) - export, import, backup, restore, migrate
- **Formats** (`dumpFormats`) - sql, json, csv, binary
- **Statuses** (`dumpStatuses`) - completed, failed

### GraphQL Filters

- **Operation Types** (`operationTypes`) - query, mutation, subscription
- **Operation Names** (`operationNames`) - Contains, against the operation name
- **Errors** (`hasErrors`) - `true` for operations that returned errors; the
  error badge on a row sets it
- **N+1** (`hasN1`) - `true` for operations with a suspected N+1; the N+1
  badge on a row sets it

## Filter UI Components

![Filtering in Action](/img/screenshots/filtering.png)

### Range Controls

A row under the page title carries the time window and, where entries measure
one, the duration. Both write to the URL, so the narrowed view is a link.

### Filter Badges

Every filter you have applied appears as a badge below the header:

```
Method: GET ×    Status: 500 ×
```

Click the × to remove one, or **Clear all** to remove them all at once.

### Filtering From a Row

Most values in a table are buttons. Clicking a method, a status code, a path, a
queue name or a tag adds it as a filter — this is how filters are added, rather
than through a separate filter menu.

### Search

The search box above each table matches the entry's payload and its tags. It is
applied by the server alongside the other filters.

### Per-Page Controls

Some lists carry a control of their own:

- **Queries** - a **Slow Only** switch in the header
- **Exceptions** - **All / Unresolved / Resolved** tabs
- **GraphQL** - the error and N+1 badges on a row filter the list to operations
  that have them

## URL-Driven Filters

Filters are reflected in the URL query string:

```
/nestlens/requests?statuses=500&methods=POST&paths=/api/users&window=1h
```

Parameter names are plural, and one accepts several comma-separated values:
`statuses=500,503`. A name the API does not know is ignored rather than
rejected, so a link that filters nothing is usually a misspelled parameter.

Benefits:
- **Bookmarkable** - Save filtered views
- **Shareable** - Send links to teammates
- **Browser Navigation** - Back/forward maintains filters
- **Deep Linking** - Link directly to filtered results

## Filter Combinations

Different filters combine with AND, and the values of one filter with OR:

```
statuses=500,503&methods=POST&paths=/api/*
  ->  (status 500 OR 503) AND method POST AND path starting /api/
```

### Tag Filters

Filtering by several tags in the dashboard matches an entry carrying **any** of
them.

The API offers both, on its own endpoint:

```
GET /nestlens/__nestlens__/api/tags/entries?tags=error,production&logic=AND
```

`logic` accepts `AND` or `OR` and defaults to `OR`.

## Clear Filters

Remove all active filters:

1. **Clear all** - the button beside the filter badges, shown once more than one
   filter is active
2. **One at a time** - the × on a badge
3. **Navigation** - clicking the entry type in the sidebar opens it unfiltered

## Filter Persistence

The URL is the only place a filter is kept:

- **Survives a refresh** - reloading the page keeps every filter
- **Survives the back button** - browser history moves between filtered views
- **Nothing is stored locally** - opening the same page in another tab starts
  from whatever that tab's URL says

## Performance Considerations

Filtering happens on the server, never in the browser, and each page is fetched
already narrowed:

- **SQLite** answers filters in SQL
- **Memory and Redis** walk their entries and test each one, so a filtered page
  on a large store costs in proportion to the store, not to the page

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

### Cache Reads

```
Type: Cache
Operation: get
```

## Next Steps

- Master [Keyboard Shortcuts](./keyboard-shortcuts.md) for faster filtering
- Learn about [Navigation](./navigation.md)
- Back to [Dashboard Overview](./overview.md)
