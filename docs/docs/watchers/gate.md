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
| `ignoreAbilities` | string[] | `[]` | Abilities to ignore |

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

### Authorization Service

```typescript
@Injectable()
export class AuthorizationService {
  async can(
    gate: string,
    action: string,
    subject?: any,
    user?: any,
  ): Promise<boolean> {
    // Authorization logic
    // Automatically tracked by NestLens
    return this.checkPermission(gate, action, subject, user);
  }

  async allows(gate: string, user: User): Promise<boolean> {
    return await this.can(gate, 'access', null, user);
  }

  async denies(gate: string, user: User): Promise<boolean> {
    return !(await this.allows(gate, user));
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

```typescript
@Injectable()
export class PostAuthorizationService {
  async canUpdatePost(user: User, post: Post): Promise<boolean> {
    // Tracked with subject: 'Post', action: 'update'
    if (user.id === post.authorId) return true;
    if (user.role === 'admin') return true;
    return false;
  }

  async canDeletePost(user: User, post: Post): Promise<boolean> {
    return user.id === post.authorId || user.role === 'admin';
  }
}

@Controller('posts')
export class PostController {
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @User() user: User,
  ) {
    const post = await this.postService.findOne(id);

    // Authorization check tracked
    const canUpdate = await this.authService.canUpdatePost(user, post);
    if (!canUpdate) {
      throw new ForbiddenException('Cannot update this post');
    }

    return this.postService.update(id, dto);
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
  async can(action: string, subject: string, user: User): Promise<boolean> {
    const permission = `${subject}:${action}`;
    const allowed = user.roles.some(role =>
      role.permissions.includes(permission),
    );

    // Tracked automatically
    return allowed;
  }
}

// Usage
const canEdit = await this.rbac.can('edit', 'users', user);
// Tracked as: gate: 'users', action: 'edit', allowed: true/false
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
