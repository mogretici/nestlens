---
sidebar_position: 2
---

# Request Watcher

The Request Watcher tracks all HTTP requests and responses in your NestJS application, capturing detailed information about endpoints, performance, and data flow.

## What Gets Captured

- HTTP method (GET, POST, PUT, DELETE, etc.)
- Request URL, path, query parameters, and route params
- Request headers (with sensitive header masking)
- Request body (configurable)
- Response status code and headers
- Response body (configurable)
- Client IP address and user agent
- Controller and handler information
- User information (from request.user)
- Session data (from request.session)
- Custom tags
- Duration (milliseconds)
- Memory usage (bytes)

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      ignorePaths: ['/health', '/metrics'],
      maxBodySize: 64 * 1024, // 64KB
      captureHeaders: true,
      captureBody: true,
      captureResponse: true,
      captureUser: true,
      captureSession: true,
      captureResponseHeaders: true,
      captureControllerInfo: true,
      tags: async (req) => {
        // Return custom tags for this request
        return ['api', req.method.toLowerCase()];
      },
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable request tracking |
| `ignorePaths` | string[] | `[]` | Paths to exclude from tracking |
| `maxBodySize` | number | `64 * 1024` | Maximum body size to capture (bytes) |
| `captureHeaders` | boolean | `true` | Capture request headers |
| `captureBody` | boolean | `true` | Capture request body |
| `captureResponse` | boolean | `true` | Capture response body |
| `captureUser` | boolean | `true` | Capture authenticated user info |
| `captureSession` | boolean | `true` | Capture session data |
| `captureResponseHeaders` | boolean | `true` | Capture response headers |
| `captureControllerInfo` | boolean | `true` | Capture controller/handler names |
| `tags` | function | `undefined` | Function to generate custom tags |

## Payload Structure

```typescript
interface RequestEntry {
  type: 'request';
  payload: {
    method: string;               // HTTP method
    url: string;                  // Full URL
    path: string;                 // Path only
    query: Record<string, unknown>;   // Query parameters
    params: Record<string, unknown>;  // Route parameters
    headers: Record<string, string>;
    body?: unknown;               // Request body
    ip?: string;                  // Client IP
    userAgent?: string;           // User agent
    statusCode: number;           // Response status (always present, defaults to 500 on error)
    responseBody?: unknown;       // Response body
    responseHeaders?: Record<string, string>;
    duration: number;             // Milliseconds (always present)
    memory: number;               // Bytes (always present)
    controllerAction?: string;    // e.g., "UserController.create"
    handler?: string;             // Handler method name
    user?: {                      // Authenticated user
      id: string | number;
      name?: string;
      email?: string;
    };
    session?: Record<string, unknown>;
    tags?: string[];              // Custom tags
  };
}
```

## Usage Example

The Request Watcher automatically intercepts all HTTP requests. No manual instrumentation needed:

```typescript
// Your controller - no changes needed
@Controller('users')
export class UserController {
  @Post()
  async create(@Body() data: CreateUserDto, @Req() request: Request) {
    // Request automatically tracked
    return this.userService.create(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    // All endpoints are tracked
    return this.userService.findOne(id);
  }
}
```

### Adding Custom Tags

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      tags: async (req) => {
        const tags: string[] = [];

        // Add tags based on path
        if (req.path.startsWith('/api')) {
          tags.push('api');
        }

        // Add tags based on user
        if (req.user) {
          tags.push('authenticated');
          if (req.user.role === 'admin') {
            tags.push('admin');
          }
        }

        // Add tags based on method
        tags.push(req.method.toLowerCase());

        return tags;
      },
    },
  },
})
```

### Ignoring Specific Paths

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      ignorePaths: [
        '/health',
        '/metrics',
        '/swagger',
        '/api/internal',
      ],
    },
  },
})
```

## Dashboard View

![Request Detail View](/img/screenshots/request_detail.png)

In the NestLens dashboard, request entries appear in the Requests tab showing:

- Timeline view of all requests
- Method badges (GET, POST, etc.)
- Status code badges (200, 404, 500, etc.)
- Response time charts
- Request/response inspection
- User information
- Correlated queries, logs, and exceptions

### Filters Available

- Filter by HTTP method
- Filter by status code
- Filter by path pattern
- Filter by user
- Filter by tags
- Filter by response time
- Search by URL

## Sensitive Data Handling

The Request Watcher automatically masks sensitive headers:

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`

Sensitive values are replaced with `***` in the captured data.

## Request Correlation

Each request is assigned a unique ID that propagates to all related entries:

```typescript
// Access the request ID in your code
@Get()
async getData(@Req() req: NestLensRequest) {
  const requestId = req.nestlensRequestId;
  // Use for correlation with external systems
}
```

The request ID is also added to response headers as `x-nestlens-request-id`.

## Related Watchers

- [Exception Watcher](./exception) - See exceptions that occurred during requests
- [Query Watcher](./query) - See database queries executed during requests
- [Log Watcher](./log) - See logs emitted during requests
- [HTTP Client Watcher](./http-client) - See outgoing HTTP calls made during requests
