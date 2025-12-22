---
sidebar_position: 2
---

# Quick Start

Get NestLens running in 3 simple steps.

## Step 1: Import the Module

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      enabled: process.env.NODE_ENV !== 'production',
    }),
  ],
})
export class AppModule {}
```

## Step 2: (Optional) Use NestLens Logger

To capture all application logs, use the NestLensLogger:

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestLensLogger } from 'nestlens';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(NestLensLogger);
  app.useLogger(logger);

  await app.listen(3000);
}
bootstrap();
```

## Step 3: Access the Dashboard

Start your NestJS application and open:

```
http://localhost:3000/nestlens
```

You should see the NestLens dashboard!

## What's Tracked by Default

With zero configuration, NestLens tracks:
- All HTTP requests and responses
- Database queries (TypeORM/Prisma auto-detected)
- Unhandled exceptions
- Application logs

## Next Steps

- [First Steps](/docs/getting-started/first-steps) - Tour the dashboard
- [Configuration](/docs/configuration/basic-config) - Customize NestLens
- [Watchers](/docs/watchers/overview) - Enable more watchers
