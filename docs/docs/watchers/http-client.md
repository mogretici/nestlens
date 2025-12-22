---
sidebar_position: 11
---

# HTTP Client Watcher

The HTTP Client Watcher monitors outgoing HTTP requests made by your NestJS application, tracking external API calls, performance, and failures.

## What Gets Captured

- HTTP method (GET, POST, etc.)
- Full URL and hostname
- Request headers and body
- Response status code
- Response headers and body
- Request duration
- Error messages
- Sensitive data masking

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      enabled: true,
      maxBodySize: 64 * 1024, // 64KB
      captureRequestBody: true,
      captureResponseBody: true,
      ignoreHosts: ['localhost', 'internal-service'],
      sensitiveHeaders: ['x-custom-token'],
      sensitiveRequestParams: ['password', 'ssn'],
      sensitiveResponseParams: ['access_token', 'refresh_token'],
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable HTTP client tracking |
| `maxBodySize` | number | `64 * 1024` | Max body size to capture (bytes) |
| `captureRequestBody` | boolean | `true` | Capture request body |
| `captureResponseBody` | boolean | `true` | Capture response body |
| `ignoreHosts` | string[] | `[]` | Hosts to ignore |
| `sensitiveHeaders` | string[] | `[]` | Additional headers to mask |
| `sensitiveRequestParams` | string[] | `[]` | Request params to mask |
| `sensitiveResponseParams` | string[] | `[]` | Response params to mask |

## Payload Structure

```typescript
interface HttpClientEntry {
  type: 'http-client';
  payload: {
    method: string;             // HTTP method
    url: string;                // Full URL
    hostname?: string;          // Host name
    path?: string;              // Path + query
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;      // Masked if sensitive
    statusCode?: number;        // Response status
    responseHeaders?: Record<string, string>;
    responseBody?: unknown;     // Masked if sensitive
    duration: number;           // Request duration (ms)
    error?: string;             // Error message
  };
}
```

## Usage Example

### Setup HTTP Module

```typescript
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
})
export class AppModule {}
```

### Provide HttpService to NestLens

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { NESTLENS_HTTP_CLIENT } from 'nestlens';

@Module({
  providers: [
    {
      provide: NESTLENS_HTTP_CLIENT,
      useFactory: (httpService: HttpService) => httpService.axiosRef,
      inject: [HttpService],
    },
  ],
})
export class AppModule {}
```

### Making HTTP Requests

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ApiService {
  constructor(private httpService: HttpService) {}

  async fetchUsers() {
    // Automatically tracked
    const response = await firstValueFrom(
      this.httpService.get('https://api.example.com/users')
    );
    return response.data;
  }

  async createUser(data: CreateUserDto) {
    const response = await firstValueFrom(
      this.httpService.post('https://api.example.com/users', data)
    );
    return response.data;
  }

  async updateUser(id: string, data: UpdateUserDto) {
    const response = await firstValueFrom(
      this.httpService.put(`https://api.example.com/users/${id}`, data)
    );
    return response.data;
  }
}
```

## Dashboard View

In the NestLens dashboard, HTTP client entries show:

- Timeline of outgoing requests
- Request/response inspection
- Status code distribution
- Slowest external APIs
- Most called endpoints
- Error rate by host
- Network performance metrics

## Sensitive Data Masking

The watcher automatically masks sensitive data:

### Default Masked Headers
- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`

### Default Masked Request Params
- `password`
- `password_confirmation`
- `current_password`
- `new_password`
- `credit_card`
- `card_number`
- `cvv`
- `cvc`
- `pin`
- `ssn`
- `social_security`
- `secret`

### Default Masked Response Params
- `access_token`
- `refresh_token`
- `api_key`
- `api_secret`
- `private_key`
- `secret`
- `token`

### Custom Masking

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      sensitiveHeaders: ['x-custom-auth', 'x-api-secret'],
      sensitiveRequestParams: ['social_security', 'bank_account'],
      sensitiveResponseParams: ['session_token', 'jwt'],
    },
  },
})

// Masked values appear as: ********
```

## Filtering Requests

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      // Ignore internal services
      ignoreHosts: [
        'localhost',
        '127.0.0.1',
        'internal-api',
        'staging-api',
      ],
    },
  },
})
```

## Performance Monitoring

### Track Slow API Calls

```typescript
@Injectable()
export class PaymentService {
  async processPayment(amount: number) {
    // Track which external API calls are slow
    const response = await firstValueFrom(
      this.httpService.post('https://payment-gateway.com/charge', {
        amount,
        currency: 'USD',
      })
    );
    // Dashboard shows if this API is consistently slow
    return response.data;
  }
}
```

### Retry Logic

```typescript
import { retry } from 'rxjs/operators';

async fetchDataWithRetry() {
  // All retry attempts are tracked
  const response = await firstValueFrom(
    this.httpService.get('https://api.example.com/data').pipe(
      retry(3)
    )
  );
  return response.data;
}
```

## Error Handling

```typescript
@Injectable()
export class ExternalApiService {
  async callExternalApi() {
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://api.example.com/data')
      );
      return response.data;
    } catch (error) {
      // Error is tracked automatically with status code and message
      console.error('External API call failed:', error);
      throw new ServiceUnavailableException('External service unavailable');
    }
  }
}
```

## Request/Response Examples

### GET Request
```typescript
await firstValueFrom(
  this.httpService.get('https://api.example.com/users', {
    params: { page: 1, limit: 10 },
    headers: { 'X-API-Key': 'secret' }, // Masked in dashboard
  })
);
```

### POST Request
```typescript
await firstValueFrom(
  this.httpService.post('https://api.example.com/users', {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'secret123', // Masked in dashboard
  })
);
```

## Related Watchers

- [Request Watcher](./request) - See which requests triggered external API calls
- [Exception Watcher](./exception) - Track HTTP client errors
- [Log Watcher](./log) - See logs related to API calls
