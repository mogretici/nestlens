---
sidebar_position: 3
---

# Data Masking

NestLens automatically masks sensitive data to protect credentials, tokens, and personal information from being stored in logs.

## Overview

Data masking protects:
- Authentication tokens and passwords
- API keys and secrets
- Credit card numbers and personal data
- Session cookies and credentials
- Database connection strings

## Automatic Masking

NestLens automatically masks sensitive data across different watchers.

### HTTP Request Headers

Sensitive headers are automatically masked:

```typescript
// Original request
headers: {
  'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  'x-api-key': 'sk_live_1234567890',
  'cookie': 'session=abc123; token=xyz789'
}

// Stored in NestLens
headers: {
  'authorization': '********',
  'x-api-key': '********',
  'cookie': '********'
}
```

### Masked Header Patterns

By default, these headers are masked:

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`

### HTTP Client Requests

Outbound HTTP requests also mask sensitive headers:

```typescript
// HTTP Client Watcher config
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      sensitiveHeaders: [
        'authorization',
        'x-api-key',
        'api-key',
      ],
    },
  },
})
```

## Redis Data Masking

Redis keys containing sensitive patterns are automatically masked.

### Auto-Masked Key Patterns

Keys matching these patterns have their values masked:

- `password`
- `token`
- `secret`
- `auth`
- `key`
- `credential`
- `session`

### Example

```typescript
// Command: redis.set('user:token:abc', 'secret-value')

// Stored as:
{
  command: 'set',
  args: ['user:token:abc', '********'],
  result: '********'
}

// Command: redis.get('user:name')

// Stored as:
{
  command: 'get',
  args: ['user:name'],
  result: 'John Doe'  // Not masked
}
```

## Model Data Masking

Entity data is automatically masked when captured.

### Sensitive Field Patterns

These field names are automatically masked:

- `password`
- `passwordHash`
- `secret`
- `token`
- `apiKey`
- `accessToken`
- `refreshToken`
- `creditCard`
- `ssn`
- `privateKey`

### Example

```typescript
// User entity
{
  id: 123,
  email: 'user@example.com',
  password: 'hashed_password',
  apiKey: 'sk_live_123456',
}

// Stored in NestLens
{
  id: 123,
  email: 'user@example.com',
  password: '********',
  apiKey: '********',
}
```

### Disable Data Capture

For maximum security, disable data capture entirely:

```typescript
NestLensModule.forRoot({
  watchers: {
    model: {
      captureData: false,  // Don't capture entity data at all
    },
  },
})
```

## Custom Masking

Extend masking to protect additional sensitive data.

### Custom Sensitive Headers

Add custom headers to mask:

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      sensitiveHeaders: [
        'authorization',
        'x-api-key',
        'x-custom-token',      // Add custom header
        'x-internal-secret',   // Add another
      ],
    },
  },
})
```

### Custom Request Parameters

Mask specific request body parameters:

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      sensitiveRequestParams: [
        'password',
        'credit_card',
        'ssn',
        'api_secret',
      ],
    },
  },
})
```

### Custom Response Parameters

Mask response data:

```typescript
NestLensModule.forRoot({
  watchers: {
    httpClient: {
      sensitiveResponseParams: [
        'access_token',
        'refresh_token',
        'api_key',
        'secret',
      ],
    },
  },
})
```

## Entry Filtering for Sensitive Data

Use the filter function to prevent sensitive data from being stored.

### Filter by Route

Don't track sensitive endpoints:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      // Don't track auth endpoints
      if (entry.payload.path.startsWith('/auth/')) {
        return false;
      }

      // Don't track password reset
      if (entry.payload.path.includes('/reset-password')) {
        return false;
      }
    }

    return true;
  },
})
```

### Filter by Content

Remove entries with sensitive data:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Don't store logs containing passwords
    if (entry.type === 'log') {
      const message = entry.payload.message.toLowerCase();
      if (message.includes('password') || message.includes('secret')) {
        return false;
      }
    }

    return true;
  },
})
```

### Custom Masking in Filter

Mask data before storage:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request' && entry.payload.body) {
      // Mask sensitive body fields
      const body = { ...entry.payload.body };

      if (body.password) body.password = '********';
      if (body.credit_card) body.credit_card = '********';

      entry.payload.body = body;
    }

    return true;
  },
})
```

## Request Body Masking

Control what request body data is captured.

### Disable Body Capture

Don't capture request bodies at all:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      captureBody: false,  // Never capture request bodies
    },
  },
})
```

### Limit Body Size

Prevent large payloads from being stored:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      maxBodySize: 1024,  // 1KB limit
    },
  },
})
```

Bodies exceeding this size are truncated:

```typescript
{
  payload: {
    body: {
      _truncated: true,
      _size: 524288  // 512KB actual size
    }
  }
}
```

## Response Body Masking

Control response data capture.

### Disable Response Capture

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      captureResponse: false,  // Never capture responses
    },
    httpClient: {
      captureResponseBody: false,  // No outbound response bodies
    },
  },
})
```

### Selective Response Capture

Capture only specific status codes:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      // Only capture error responses
      if (entry.payload.statusCode < 400) {
        delete entry.payload.responseBody;
      }
    }
    return true;
  },
})
```

## Production Security

### Recommended Production Config

```typescript
NestLensModule.forRoot({
  // Disable in production (safest)
  enabled: process.env.NODE_ENV !== 'production',

  // OR if enabled in production:
  watchers: {
    request: {
      captureBody: false,           // Don't capture request bodies
      captureResponse: false,        // Don't capture responses
      captureSession: false,         // Don't capture sessions
    },
    httpClient: {
      captureRequestBody: false,     // No outbound request bodies
      captureResponseBody: false,    // No outbound responses
      sensitiveHeaders: [            // Mask all auth headers
        'authorization',
        'x-api-key',
        'cookie',
      ],
    },
    model: {
      captureData: false,            // Never capture entity data
    },
  },

  filter: (entry) => {
    // Don't track auth endpoints
    if (entry.type === 'request' &&
        entry.payload.path.startsWith('/auth/')) {
      return false;
    }
    return true;
  },
})
```

## Compliance Considerations

### GDPR Compliance

Protect personal data:

```typescript
NestLensModule.forRoot({
  watchers: {
    model: {
      captureData: false,  // Don't store personal data
    },
  },

  filter: (entry) => {
    // Mask email addresses
    if (entry.type === 'log') {
      entry.payload.message = entry.payload.message.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '***EMAIL***'
      );
    }
    return true;
  },
})
```

### PCI DSS Compliance

Never store credit card data:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    const json = JSON.stringify(entry);

    // Detect credit card patterns (simple example)
    const cardPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;

    if (cardPattern.test(json)) {
      // Don't store entries with potential card numbers
      return false;
    }

    return true;
  },
})
```

### HIPAA Compliance

Protect health information:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      captureBody: false,
      captureResponse: false,
    },
  },

  filter: (entry) => {
    // Don't track medical endpoints
    if (entry.type === 'request') {
      const medicalPaths = ['/patient/', '/medical/', '/health/'];
      if (medicalPaths.some(path => entry.payload.path.includes(path))) {
        return false;
      }
    }
    return true;
  },
})
```

## Verification

### Audit Captured Data

Regularly review what's being stored:

1. **Check Dashboard** - Review entries for sensitive data
2. **Export Data** - Download entries and inspect
3. **Database Inspection** - Query storage directly

```sql
-- SQLite example
SELECT type, payload FROM entries
WHERE payload LIKE '%password%'
   OR payload LIKE '%token%'
   OR payload LIKE '%secret%';
```

### Test Masking

Verify masking is working:

```typescript
// Make request with auth
curl -H "Authorization: Bearer secret-token" \
     http://localhost:3000/api/users

// Check dashboard
// Authorization header should show: ********
```

## Best Practices

### 1. Default to Minimal Capture

Start with minimal data capture:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      captureBody: false,
      captureResponse: false,
    },
  },
})
```

Enable only what you need for debugging.

### 2. Use Filtering Liberally

Filter out sensitive routes:

```typescript
filter: (entry) => {
  const sensitivePaths = [
    '/auth/',
    '/login',
    '/password',
    '/payment/',
  ];

  if (entry.type === 'request') {
    return !sensitivePaths.some(path =>
      entry.payload.path.includes(path)
    );
  }

  return true;
}
```

### 3. Regular Security Audits

Schedule reviews:
- Monthly data audit
- Quarterly security review
- After any configuration changes

### 4. Educate Team

Ensure developers know:
- What data is being captured
- How to add custom masking
- When to disable tracking

### 5. Document Sensitive Patterns

Keep a list of what's considered sensitive in your app:

```typescript
// sensitive-patterns.ts
export const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-custom-auth',
];

export const SENSITIVE_PATHS = [
  '/auth/',
  '/payment/',
  '/admin/secrets/',
];

export const SENSITIVE_FIELDS = [
  'password',
  'creditCard',
  'ssn',
];
```

## Next Steps

- Configure [Access Control](./access-control.md)
- Set up [IP Whitelisting](./ip-whitelisting.md)
- Review [Production Usage](./production-usage.md)
