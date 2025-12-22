# Authorization Configuration

NestLens provides comprehensive authorization controls to secure access to your monitoring dashboard and API. This ensures that only authorized users can view sensitive application data.

## AuthorizationConfig Interface

The authorization configuration provides multiple layers of access control:

```typescript
interface AuthorizationConfig {
  allowedEnvironments?: string[] | null;
  environmentVariable?: string;
  allowedIps?: string[];
  canAccess?: (req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>;
  requiredRoles?: string[];
}
```

## Environment-Based Access Control

### allowedEnvironments

Restricts NestLens access to specific environments.

- **Type**: `string[] | null`
- **Default**: `['development', 'local', 'test']`

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: ['development', 'local', 'test'],
  },
});
```

To allow access in all environments, set to `null`:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: null, // Allow in all environments (use with caution!)
  },
});
```

Custom environments:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: ['development', 'staging', 'qa'],
  },
});
```

### environmentVariable

Specifies which environment variable to check for the current environment.

- **Type**: `string`
- **Default**: `'NODE_ENV'`

```typescript
NestLensModule.forRoot({
  authorization: {
    environmentVariable: 'NODE_ENV', // Default
  },
});
```

Using a custom environment variable:

```typescript
NestLensModule.forRoot({
  authorization: {
    environmentVariable: 'APP_ENV',
    allowedEnvironments: ['dev', 'local'],
  },
});
```

## IP-Based Access Control

### allowedIps

Restricts access to specific IP addresses. Supports wildcard patterns for subnet matching.

- **Type**: `string[]`
- **Default**: `undefined` (all IPs allowed)

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: ['127.0.0.1', '::1'], // Only localhost
  },
});
```

#### Wildcard Support

Use the `*` wildcard to match IP ranges:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      '127.0.0.1',           // Localhost IPv4
      '::1',                 // Localhost IPv6
      '192.168.1.*',         // All IPs in 192.168.1.0/24 subnet
      '10.0.*.*',            // All IPs in 10.0.0.0/16 subnet
      '172.16.*.100',        // Specific host across multiple subnets
    ],
  },
});
```

## Custom Authorization Function

### canAccess

Provides complete control over access authorization with custom logic.

- **Type**: `(req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>`
- **Default**: `undefined`

#### Simple Boolean Authorization

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      // Check for a specific header
      return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
    },
  },
});
```

#### User Context Authorization

Return an `AuthUser` object to provide user context and enable role-based access:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      // Extract token from header
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return false;

      // Validate token and get user
      const user = await validateToken(token);
      if (!user) return false;

      // Return user information
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      };
    },
    requiredRoles: ['admin'], // User must have ALL specified roles
  },
});
```

#### Integration with NestJS Guards

```typescript
import { Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class NestLensAuthService {
  async authorize(req: Request): Promise<AuthUser | boolean> {
    // Use your existing authentication service
    const user = req.user; // Assuming you have auth middleware

    if (!user) {
      return false;
    }

    // Check if user has permission to access monitoring
    if (!user.permissions.includes('view:monitoring')) {
      return false;
    }

    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      roles: user.roles,
    };
  }
}

// In your module configuration
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => app.get(NestLensAuthService).authorize(req),
    requiredRoles: ['admin', 'developer'],
  },
});
```

## Role-Based Access Control

### requiredRoles

Specifies which roles are required to access NestLens. Works in conjunction with `canAccess` when it returns an `AuthUser` object.

- **Type**: `string[]`
- **Default**: `undefined` (no role requirements)

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      const user = await getUserFromRequest(req);
      if (!user) return false;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles, // e.g., ['admin', 'developer', 'viewer']
      };
    },
    requiredRoles: ['admin'], // User must have ALL specified roles
  },
});
```

## AuthUser Interface

When `canAccess` returns an `AuthUser` object, it provides user context that can be used for role-based access control and audit logging.

```typescript
interface AuthUser {
  id: string | number;           // Required: Unique user identifier
  name?: string;                 // Optional: User's display name
  email?: string;                // Optional: User's email address
  roles?: string[];              // Optional: User's roles for role-based access
  [key: string]: unknown;        // Optional: Additional custom properties
}
```

Example with custom properties:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      const user = await getUserFromRequest(req);
      if (!user) return false;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        // Custom properties
        department: user.department,
        accessLevel: user.accessLevel,
        lastLogin: user.lastLogin,
      };
    },
  },
});
```

## Complete Authorization Examples

### Development-Only Access

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: ['development', 'local'],
    environmentVariable: 'NODE_ENV',
  },
});
```

### IP Whitelist for Production

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: null, // Allow all environments
    allowedIps: [
      '10.0.1.*',      // Internal network
      '203.0.113.50',  // VPN gateway
    ],
  },
});
```

### Token-Based Authentication

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const token = req.headers['x-monitoring-token'];
      return token === process.env.NESTLENS_ACCESS_TOKEN;
    },
  },
});
```

### Advanced Multi-Layer Authorization

```typescript
NestLensModule.forRoot({
  authorization: {
    // Layer 1: Environment check
    allowedEnvironments: ['development', 'staging', 'production'],
    environmentVariable: 'NODE_ENV',

    // Layer 2: IP whitelist (optional, only for production)
    allowedIps: process.env.NODE_ENV === 'production'
      ? ['10.0.1.*', '203.0.113.50']
      : undefined,

    // Layer 3: User authentication and authorization
    canAccess: async (req) => {
      // Skip user auth in development
      if (process.env.NODE_ENV === 'development') {
        return true;
      }

      // Require authenticated user in staging/production
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return false;

      const user = await validateJWT(token);
      if (!user) return false;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      };
    },

    // Layer 4: Role-based access (only in production)
    requiredRoles: process.env.NODE_ENV === 'production'
      ? ['admin', 'ops']
      : undefined,
  },
});
```

## Security Best Practices

1. **Never expose in production without authorization**: Always configure proper authorization before deploying to production.

2. **Use multiple layers**: Combine environment, IP, and user-based authorization for defense in depth.

3. **Rotate tokens regularly**: If using token-based authentication, implement token rotation.

4. **Audit access**: Consider logging who accesses NestLens for security auditing.

5. **Use HTTPS**: Always access NestLens over HTTPS in production to protect credentials.

6. **Principle of least privilege**: Only grant access to users who need monitoring capabilities.

## Next Steps

- [Basic Configuration](./basic-config.md) - General NestLens settings
- [Storage Configuration](./storage.md) - Data persistence options
- [Rate Limiting Configuration](./rate-limiting.md) - API protection
