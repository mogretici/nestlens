---
sidebar_position: 16
---

# Command Watcher

The Command Watcher tracks CQRS command execution in NestJS applications, monitoring command handling, performance, and results.

## What Gets Captured

- Command name (class name)
- Handler name
- Execution status (executing, completed, failed)
- Processing duration
- Command payload
- Command result
- Error messages
- Command metadata

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    command: {
      enabled: true,
      capturePayload: true,
      captureResult: true,
      maxPayloadSize: 64 * 1024, // 64KB
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable command tracking |
| `capturePayload` | boolean | `true` | Capture command payload |
| `captureResult` | boolean | `true` | Capture command result |
| `maxPayloadSize` | number | `64 * 1024` | Max payload size (bytes) |

## Payload Structure

```typescript
interface CommandEntry {
  type: 'command';
  payload: {
    name: string;               // Command class name
    handler?: string;           // Handler name
    status: 'executing' | 'completed' | 'failed';
    duration?: number;          // Execution time (ms)
    payload?: unknown;          // Command data
    result?: unknown;           // Command result
    error?: string;             // Error message
    metadata?: Record<string, unknown>; // Command metadata
  };
}
```

## Usage Example

### Setup CQRS Module

```typescript
// Install: npm install @nestjs/cqrs
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [CqrsModule],
})
export class AppModule {}
```

### Provide CommandBus to NestLens

```typescript
import { CommandBus } from '@nestjs/cqrs';
import { NESTLENS_COMMAND_BUS } from 'nestlens';

@Module({
  providers: [
    {
      provide: NESTLENS_COMMAND_BUS,
      useExisting: CommandBus,
    },
  ],
})
export class AppModule {}
```

### Define Commands

```typescript
export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly name: string,
    public readonly password: string,
  ) {}
}

export class UpdateUserCommand {
  constructor(
    public readonly userId: string,
    public readonly data: Partial<User>,
  ) {}
}

export class DeleteUserCommand {
  constructor(public readonly userId: string) {}
}
```

### Command Handlers

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private userRepository: UserRepository) {}

  async execute(command: CreateUserCommand): Promise<User> {
    // Automatically tracked
    const user = await this.userRepository.create({
      email: command.email,
      name: command.name,
      password: command.password,
    });

    return user;
  }
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  async execute(command: UpdateUserCommand): Promise<User> {
    return await this.userRepository.update(
      command.userId,
      command.data,
    );
  }
}
```

### Executing Commands

```typescript
@Controller('users')
export class UserController {
  constructor(private commandBus: CommandBus) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    // Command execution is tracked
    const command = new CreateUserCommand(
      dto.email,
      dto.name,
      dto.password,
    );
    return await this.commandBus.execute(command);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const command = new UpdateUserCommand(id, dto);
    return await this.commandBus.execute(command);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const command = new DeleteUserCommand(id);
    return await this.commandBus.execute(command);
  }
}
```

## Dashboard View

In the NestLens dashboard, command entries show:

- Command execution timeline
- Most executed commands
- Slow commands
- Failed commands with errors
- Command execution patterns
- Average duration per command type

## Command Metadata

Add metadata to track additional context:

```typescript
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly items: OrderItem[],
    // Metadata fields
    public readonly timestamp = new Date(),
    public readonly correlationId = uuid(),
  ) {}
}
```

## Error Handling

```typescript
@CommandHandler(ProcessPaymentCommand)
export class ProcessPaymentHandler implements ICommandHandler<ProcessPaymentCommand> {
  async execute(command: ProcessPaymentCommand) {
    try {
      return await this.paymentGateway.charge(command);
    } catch (error) {
      // Error tracked automatically
      throw new PaymentFailedException(error.message);
    }
  }
}
```

## Command Validation

```typescript
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand) {
    // Validation failures are tracked
    if (!command.email || !command.name) {
      throw new BadRequestException('Missing required fields');
    }

    return await this.userRepository.create(command);
  }
}
```

## Related Watchers

- [Request Watcher](./request) - See which requests triggered commands
- [Event Watcher](./event) - Track events emitted by commands
- [Exception Watcher](./exception) - Track command failures
