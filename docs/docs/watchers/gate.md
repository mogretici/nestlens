---
sidebar_position: 17
---

# Gate Watcher

The Gate Watcher tracks authorization checks in your NestJS application, monitoring access control decisions, permissions, and policy evaluations.

## What Gets Captured

- Gate/ability name
- Action being checked
- Subject/resource being accessed
- Authorization result (allowed/denied)
- User ID making the request
- Denial reason (if applicable)
- Check duration
- Authorization context

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    gate: {
      enabled: true,
      captureContext: true,
      ignoreAbilities: ['viewDashboard', 'accessPublic'],
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable gate tracking |
| `captureContext` | boolean | `true` | Capture authorization context |
| `ignoreAbilities` | string[] | `[]` | Skip a check whose gate or action equals one of these, or whose `gate:action` does |

## Payload Structure

```typescript
interface GateEntry {
  type: 'gate';
  payload: {
    gate: string;               // Gate/ability name
    action: string;             // Action (e.g., 'read', 'write')
    subject?: string;           // Resource/subject name
    allowed: boolean;           // Authorization result
    userId?: string | number;   // User making request
    reason?: string;            // Denial reason
    duration: number;           // Check time (ms)
    context?: Record<string, unknown>; // Additional context
  };
}
```

## Usage Example

### Provide Gate Service

```typescript
import { Module } from '@nestjs/common';
import { NESTLENS_GATE_SERVICE } from 'nestlens';

@Module({
  providers: [
    AuthorizationService,
    {
      provide: NESTLENS_GATE_SERVICE,
      useExisting: AuthorizationService,
    },
  ],
})
export class AppModule {}
```

### How a Call Is Read

The watcher wraps five methods on the service — `check`, `allows`, `denies`,
`authorize` and `can` — and reads each call as `(gate, action?, subject?, user?)`.
Only a string names the gate or the action: a second argument that is not a
string starts the subject, and whatever is not named falls back to the method's
name. `denies` returning `true` is recorded as a refusal.

| Call | `gate` | `action` | `subject` | `userId` |
|------|--------|----------|-----------|----------|
| `can('PostPolicy', 'update', post, user)` | `PostPolicy` | `update` | `Post` | `user.id` |
| `allows('update-post', post, user)` | `update-post` | `allows` | `Post` | `user.id` |
| `denies('delete-post', post)` | `delete-post` | `denies` | `Post` | — |
| `check('viewDashboard')` | `viewDashboard` | `check` | — | — |

`subject` is a string as given, or an object's `name`, `type` or class name;
`userId` is the user's `id`, `userId`, `sub` or `_id`. A service whose
arguments come in another order is recorded in that order, so use
[manual tracking](#manual-tracking) for it. Methods with other names are not
wrapped at all.

### Authorization Service

```typescript
@Injectable()
export class AuthorizationService {
  // Recorded as gate, action, subject and user.
  async can(gate: string, action: string, subject?: any, user?: User): Promise<boolean> {
    return this.checkPermission(gate, action, subject, user);
  }

  // Recorded as gate, 'allows', subject and user.
  async allows(gate: string, subject?: any, user?: User): Promise<boolean> {
    return this.checkPermission(gate, 'access', subject, user);
  }

  // Recorded as gate, 'denies', subject and user; `true` is a refusal.
  async denies(gate: string, subject?: any, user?: User): Promise<boolean> {
    return !(await this.checkPermission(gate, 'access', subject, user));
  }

  // Not one of the five names, so calling it from the others records nothing
  // twice — `this.can(...)` from inside `allows` would.
  private async checkPermission(
    gate: string,
    action: string,
    subject: unknown,
    user?: User,
  ): Promise<boolean> {
    // Authorization logic
  }
}
```

### Using Guards

```typescript
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ability = this.reflector.get<string>('ability', context.getHandler());
    if (!ability) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // This check is tracked
    return await this.authService.can(ability, 'execute', null, user);
  }
}

// Use in controllers
@Controller('posts')
@UseGuards(AbilityGuard)
export class PostController {
  @Get()
  @SetMetadata('ability', 'viewPosts')
  async findAll() {
    return this.postService.findAll();
  }

  @Post()
  @SetMetadata('ability', 'createPost')
  async create(@Body() dto: CreatePostDto) {
    return this.postService.create(dto);
  }

  @Delete(':id')
  @SetMetadata('ability', 'deletePost')
  async remove(@Param('id') id: string) {
    return this.postService.remove(id);
  }
}
```

### Resource-Based Authorization

A method of its own name — `canUpdatePost(user, post)` — is not one of the
five, so it is not recorded. Route it through one that is:

```typescript
@Injectable()
export class PostAuthorizationService {
  constructor(private readonly auth: AuthorizationService) {}

  // Recorded as gate 'PostPolicy', action 'update', subject 'Post'.
  canUpdatePost(user: User, post: Post): Promise<boolean> {
    return this.auth.can('PostPolicy', 'update', post, user);
  }
}
```

## Dashboard View

In the NestLens dashboard, gate entries show:

- Authorization check timeline
- Allow/deny rates
- Most checked abilities
- Denied access attempts
- User access patterns
- Failed authorization analysis

## Manual Tracking

For custom authorization logic:

```typescript
import { Injectable } from '@nestjs/common';
import { GateWatcher } from 'nestlens';

@Injectable()
export class CustomAuthService {
  constructor(private gateWatcher: GateWatcher) {}

  async checkAccess(user: User, resource: string): Promise<boolean> {
    const allowed = this.evaluatePermission(user, resource);

    // Manually track the check
    this.gateWatcher.trackCheck(
      'customGate',
      'access',
      resource,
      allowed,
      user,
      allowed ? undefined : 'Insufficient permissions',
    );

    return allowed;
  }
}
```

## Role-Based Access Control (RBAC)

```typescript
@Injectable()
export class RBACService {
  can(subject: string, action: string, resource: unknown, user: User): boolean {
    const permission = `${subject}:${action}`;
    return user.roles.some((role) => role.permissions.includes(permission));
  }
}

// Usage
const canEdit = this.rbac.can('users', 'edit', null, user);
// Recorded as: gate 'users', action 'edit', userId user.id, allowed true/false
```

## Ignoring Abilities

Filter out noisy or internal checks:

```typescript
NestLensModule.forRoot({
  watchers: {
    gate: {
      ignoreAbilities: [
        'viewDashboard',    // Internal dashboard
        'accessPublic',     // Public resources
        'healthCheck',      // Health check endpoint
      ],
    },
  },
})
```

## Related Watchers

- [Request Watcher](./request) - See which requests triggered auth checks
- [Exception Watcher](./exception) - Track authorization failures
- [Log Watcher](./log) - See auth-related logs
