---
sidebar_position: 4
---

# Exception Watcher

The Exception Watcher captures unhandled exceptions and errors in your NestJS application, providing detailed stack traces and context for debugging.

## What Gets Captured

- Exception name (class name)
- Error message
- Stack trace
- HTTP status code (for HTTP exceptions)
- Exception context: always `HTTP` (see [Context Types](#context-types))
- Request information (method, URL, body)
- Request correlation ID

:::info Where GraphQL exceptions come from
This watcher is an HTTP exception filter: it records what a controller threw.
A resolver that throws is handled by the GraphQL server, never reaches it, and
is recorded by the **GraphQL watcher** instead — which writes both the
operation and an `exception` entry for what the resolver threw, sharing one
request id. So `stats`, the Exceptions page, `sampling.always: ['exception']`
and an alerting webhook on `events: ['exception']` all work on a GraphQL API,
provided `watchers.graphql` is enabled.

Two things are deliberately *not* recorded as exceptions: a document that does
not parse and a field the schema does not have. Nobody threw — the caller made
the mistake — and since an alerting webhook defaults to `events: ['exception']`,
recording them would let anyone with curl page whoever is on call. They are on
the operation entry with its 400.

`watchers.graphql.recordExceptions: false` turns this off; the errors stay on
the operation entry.
:::

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    exception: {
      enabled: true,
      ignoreExceptions: [
        'NotFoundException',
        'UnauthorizedException',
      ],
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable exception tracking |
| `ignoreExceptions` | string[] | `[]` | Exception class names to ignore |

## Payload Structure

```typescript
interface ExceptionEntry {
  type: 'exception';
  payload: {
    name: string;                 // Exception class name
    message: string;              // Error message
    stack?: string;               // Stack trace
    code?: string | number;       // HTTP status or error code
    context?: string;             // 'HTTP': only HTTP exceptions are recorded
    request?: {                   // The request that threw
      method: string;
      url: string;
      body?: unknown;
    };
  };
}
```

## Usage Example

The Exception Watcher automatically captures all unhandled exceptions:

```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(id);

    if (!user) {
      // This exception will be captured automatically
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  @Post()
  async create(@Body() data: CreateUserDto) {
    try {
      return await this.userService.create(data);
    } catch (error) {
      // Custom exceptions are also captured
      throw new BadRequestException('Failed to create user');
    }
  }
}
```

### Custom Exceptions

```typescript
// Custom exception class
export class BusinessRuleException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

// Will be captured with name: 'BusinessRuleException'
@Post('validate')
async validate(@Body() data: any) {
  if (!this.isValid(data)) {
    throw new BusinessRuleException('Data validation failed');
  }
}
```

### Ignoring Expected Exceptions

Some exceptions are expected and don't need tracking:

```typescript
NestLensModule.forRoot({
  watchers: {
    exception: {
      ignoreExceptions: [
        'NotFoundException',        // 404 errors
        'UnauthorizedException',    // 401 errors
        'ForbiddenException',       // 403 errors
      ],
    },
  },
})
```

## Dashboard View

![Exception Detail View](/img/screenshots/exception_detail.png)

In the NestLens dashboard, exception entries appear in the Exceptions tab showing:

- Timeline of all exceptions
- Exception type badges
- Stack trace viewer
- Request context
- Frequency charts (most common exceptions)
- Error rate trends
- Correlation with requests

### Filters Available

- **Names** (`names`) - Contains, against the exception's class name
- **Methods** (`methods`) - The HTTP method of the request that threw
- **Paths** (`paths`) - The URL of the request that threw
- **Resolved** (`resolved`) - The Exceptions page's **All / Unresolved / Resolved** tabs
- **Search** (`search`) - The message, the stack and the request
- **Time window** (`window`) - The last 5 minutes to 24 hours

Every filter and what it matches: [Filtering](../dashboard/filtering.md#exception-filters).

## Exception Analysis

### 1. Find Most Common Errors

The dashboard shows which exceptions occur most frequently:

```typescript
// If you see "ValidationException" occurring frequently:
// - Check input validation rules
// - Add better client-side validation
// - Improve error messages
```

### 2. Debug with Stack Traces

Each exception includes a full stack trace:

```
Error: User not found
    at UserService.findOne (user.service.ts:45:13)
    at UserController.getUser (user.controller.ts:23:32)
    at ...
```

### 3. Correlate with Requests

Click on an exception to see:
- The HTTP request that caused it
- Query parameters and body
- Related database queries
- User who triggered the error

## Exception Handling Best Practices

### 1. Use Specific Exception Types

```typescript
// GOOD: Specific exception types
if (!user) {
  throw new NotFoundException('User not found');
}

if (!canAccess) {
  throw new ForbiddenException('Insufficient permissions');
}

// BAD: Generic errors
if (!user) {
  throw new Error('Something went wrong');
}
```

### 2. Include Context in Messages

```typescript
// GOOD: Descriptive message
throw new NotFoundException(
  `User with ID ${id} not found in organization ${orgId}`
);

// BAD: Vague message
throw new NotFoundException('Not found');
```

### 3. Handle Expected Errors

```typescript
@Post('upload')
async upload(@UploadedFile() file: Express.Multer.File) {
  try {
    return await this.processFile(file);
  } catch (error) {
    // Log but don't throw for expected errors
    if (error instanceof UnsupportedFileTypeError) {
      throw new BadRequestException(
        `File type ${file.mimetype} not supported`
      );
    }
    // Re-throw unexpected errors to be captured
    throw error;
  }
}
```

## Exception Filters Integration

Nest gives an exception to **one** filter: the most specific that catches it —
a method's, then a controller's, then a global one — and among global filters,
one registered with `app.useGlobalFilters()` before one provided as
`APP_FILTER`, which is how NestLens registers its own. So a filter of yours that
catches an exception handles it **instead of** NestLens, and it is not recorded:

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    // Every HttpException ends here, and NestLens never sees it.
  }
}

app.useGlobalFilters(new HttpExceptionFilter());
```

Measured on NestJS 12.6: a `NotFoundException` with this filter registered
globally, or on the handler, reached that filter alone. Exceptions no filter of
yours catches are still recorded. To keep both, catch only the types your filter
has to answer differently.

## Error Monitoring Alerts

To be told about exceptions as they happen, send them to a webhook: see
[Alerting](../configuration/alerting.md), which defaults to
`events: ['exception']`.

## Context Types

Only exceptions from HTTP handlers are recorded, so `context` is always
`HTTP`. An exception in a microservice (`rpc`) or a WebSocket gateway (`ws`)
is handed back to Nest unrecorded, and one thrown by a GraphQL resolver is
recorded by the [GraphQL watcher](./graphql) instead.

## Immediate Collection

Exception entries are collected immediately (not batched) because they're critical for debugging. This ensures exceptions are saved even if the application crashes shortly after.

## Related Watchers

- [Request Watcher](./request) - See the full request that caused the exception
- [Query Watcher](./query) - See if a database query caused the error
- [Log Watcher](./log) - See logs leading up to the exception
