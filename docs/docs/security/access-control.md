---
sidebar_position: 1
---

# Access Control

NestLens provides comprehensive access control mechanisms to secure your dashboard and protect sensitive application data.

## Overview

Access control in NestLens operates on multiple layers:

1. **Environment Restrictions** - Limit access to specific environments
2. **IP Whitelisting** - Restrict access by IP address
3. **Custom Authorization** - Implement custom authentication logic
4. **Role-Based Access** - Control access based on user roles

## Environment Restrictions

The simplest form of access control limits NestLens to specific environments.

### Default Behavior

By default, NestLens only runs in development environments:

```typescript
// Default configuration
{
  authorization: {
    allowedEnvironments: ['development', 'local', 'test']
  }
}
```

### Custom Environments

Configure which environments can access NestLens:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: ['development', 'staging'],
    environmentVariable: 'NODE_ENV', // default
  },
})
```

### Allow All Environments

Set to `null` to allow any environment:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: null, // Allow all environments
  },
})
```

**Warning**: Only use in production if you have other security measures in place.

### Disable All Environments

Set to empty array to completely disable:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: [], // Disable completely
  },
})
```

### Custom Environment Variable

Use a different environment variable:

```typescript
NestLensModule.forRoot({
  authorization: {
    environmentVariable: 'APP_ENV',
    allowedEnvironments: ['dev', 'qa'],
  },
})
```

## Custom Authorization

Implement custom authentication and authorization logic.

### Basic Authorization Function

```typescript
import { Request } from 'express';

NestLensModule.forRoot({
  authorization: {
    canAccess: (req: Request) => {
      // Check for API key
      const apiKey = req.headers['x-api-key'];
      return apiKey === process.env.NESTLENS_API_KEY;
    },
  },
})
```

### Async Authorization

Use async functions for database or external checks:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req: Request) => {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return false;
      }

      // Verify with external service
      const isValid = await authService.verifyToken(token);
      return isValid;
    },
  },
})
```

### Session-Based Authorization

Check user session:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req: Request) => {
      // Require authenticated session
      return req.session?.user?.isAuthenticated === true;
    },
  },
})
```

### JWT-Based Authorization

Verify JWT tokens:

```typescript
import { JwtService } from '@nestjs/jwt';

NestLensModule.forRoot({
  authorization: {
    canAccess: async (req: Request) => {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return false;
      }

      try {
        const jwtService = new JwtService({
          secret: process.env.JWT_SECRET,
        });
        await jwtService.verifyAsync(token);
        return true;
      } catch {
        return false;
      }
    },
  },
})
```

## Role-Based Access Control

Restrict access based on user roles.

### Return User Object

Return an `AuthUser` object from `canAccess` to enable role checking:

```typescript
import { AuthUser } from 'nestlens';

NestLensModule.forRoot({
  authorization: {
    canAccess: async (req: Request): Promise<AuthUser | boolean> => {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return false;
      }

      const user = await authService.verifyToken(token);

      if (!user) {
        return false;
      }

      // Return user object with roles
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles, // e.g., ['admin', 'developer']
      };
    },
    requiredRoles: ['admin'], // User must have ALL specified roles
  },
})
```

### AuthUser Interface

The `AuthUser` object structure:

```typescript
interface AuthUser {
  id: string | number;
  name?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown; // Additional custom fields
}
```

### Required Roles

Specify which roles can access NestLens:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      // Return user with roles
      return {
        id: req.user.id,
        roles: req.user.roles,
      };
    },
    requiredRoles: ['admin'], // Only admins
  },
})
```

### Multiple Roles (AND Logic)

Users must have ALL of the specified roles:

```typescript
NestLensModule.forRoot({
  authorization: {
    requiredRoles: ['admin', 'developer'], // User must have BOTH roles
  },
})
```

If you need OR logic (user needs at least one role), implement it in your `canAccess` function:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      const user = await getUser(req);
      if (!user) return false;

      // OR logic: user needs at least one of these roles
      const allowedRoles = ['admin', 'developer', 'qa'];
      const hasAnyRole = user.roles.some(role => allowedRoles.includes(role));

      if (!hasAnyRole) return false;

      return { id: user.id, roles: user.roles };
    },
    // Don't use requiredRoles here - we handled it in canAccess
  },
})
```

### Accessing User Context

The authenticated user is available in the request:

```typescript
// In custom API endpoints or middleware
const nestlensUser = (req as any).nestlensUser;
console.log('User accessing NestLens:', nestlensUser);
```

## Combining Security Layers

Use multiple security layers together:

```typescript
NestLensModule.forRoot({
  authorization: {
    // Layer 1: Environment
    allowedEnvironments: ['development', 'staging', 'production'],

    // Layer 2: IP Whitelist
    allowedIps: ['192.168.1.*', '10.0.0.*'],

    // Layer 3: Custom Auth
    canAccess: async (req: Request) => {
      // Check authentication
      const user = await authService.getCurrentUser(req);

      if (!user) {
        return false;
      }

      // Return user for role checking
      return {
        id: user.id,
        name: user.name,
        roles: user.roles,
      };
    },

    // Layer 4: Required Roles
    requiredRoles: ['admin'],
  },
})
```

All layers must pass for access to be granted.

## Production Considerations

### Recommended Production Setup

```typescript
NestLensModule.forRoot({
  // Only enable if needed in production
  enabled: process.env.NESTLENS_ENABLED === 'true',

  authorization: {
    // Strict environment control
    allowedEnvironments: process.env.NESTLENS_ENVIRONMENTS?.split(','),

    // IP whitelist for office/VPN
    allowedIps: process.env.NESTLENS_ALLOWED_IPS?.split(','),

    // Require authentication
    canAccess: async (req) => {
      const user = await authService.authenticate(req);
      return user ? {
        id: user.id,
        roles: user.roles,
      } : false;
    },

    // Admin only
    requiredRoles: ['admin', 'super-admin'],
  },
})
```

### Environment Variables

```bash
# .env.production
NESTLENS_ENABLED=false
NESTLENS_ENVIRONMENTS=production
NESTLENS_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

### Disable in Production

Safest approach for production:

```typescript
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV !== 'production',
})
```

## Rate Limiting

Prevent abuse with built-in rate limiting:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,     // 100 requests per minute per IP
  },
})
```

### Disable Rate Limiting

```typescript
NestLensModule.forRoot({
  rateLimit: false,
})
```

### Custom Rate Limits

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,         // 1000 requests per 15 minutes
  },
})
```

## Security Best Practices

### 1. Never Expose in Production Without Auth

```typescript
// BAD - No authentication
NestLensModule.forRoot({
  enabled: true,
  authorization: {
    allowedEnvironments: null, // Allows all
  },
})

// GOOD - Strict authentication
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV !== 'production',
  authorization: {
    canAccess: async (req) => {
      return await authService.isAdmin(req);
    },
  },
})
```

### 2. Use Environment Variables

Store sensitive config in environment variables:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const apiKey = req.headers['x-api-key'];
      return apiKey === process.env.NESTLENS_API_KEY;
    },
  },
})
```

### 3. Combine Multiple Layers

Don't rely on a single security measure:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedEnvironments: ['staging', 'production'],
    allowedIps: process.env.OFFICE_IPS?.split(','),
    canAccess: async (req) => {
      return await authService.isAuthorized(req);
    },
    requiredRoles: ['admin'],
  },
})
```

### 4. Audit Access

Log access attempts:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      const user = await authService.authenticate(req);

      // Log access attempt
      await auditLog.log({
        action: 'nestlens_access',
        user: user?.id,
        ip: req.ip,
        allowed: !!user,
      });

      return user ? { id: user.id, roles: user.roles } : false;
    },
  },
})
```

### 5. Use HTTPS

Always use HTTPS in production:

```typescript
// In your main.ts
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      next();
    } else {
      res.redirect(`https://${req.headers.host}${req.url}`);
    }
  });
}
```

## Troubleshooting

### Access Denied Issues

**Issue**: Can't access dashboard despite correct credentials

**Debug Steps**:

1. **Check Environment**:
   ```typescript
   console.log('Current ENV:', process.env.NODE_ENV);
   console.log('Allowed ENVs:', config.authorization.allowedEnvironments);
   ```

2. **Check IP**:
   ```typescript
   console.log('Client IP:', req.ip);
   console.log('Allowed IPs:', config.authorization.allowedIps);
   ```

3. **Test canAccess**:
   ```typescript
   const result = await config.authorization.canAccess(req);
   console.log('canAccess result:', result);
   ```

4. **Check Roles**:
   ```typescript
   console.log('User roles:', user.roles);
   console.log('Required roles:', config.authorization.requiredRoles);
   ```

### Rate Limit Errors

**Issue**: Getting 429 Too Many Requests

**Solutions**:

1. **Increase Limits**:
   ```typescript
   rateLimit: {
     maxRequests: 500, // Increase limit
   }
   ```

2. **Disable Rate Limiting**:
   ```typescript
   rateLimit: false,
   ```

3. **Check IP Binding**:
   - Multiple users behind same IP will share limit
   - Consider per-user rate limiting if needed

## Next Steps

- Configure [IP Whitelisting](./ip-whitelisting.md)
- Learn about [Data Masking](./data-masking.md)
- Review [Production Usage Best Practices](./production-usage.md)
