---
sidebar_position: 15
---

# View Watcher

The View Watcher tracks template rendering operations in your NestJS application, monitoring performance, cache hits, and output metrics.

## What Gets Captured

- Template name/path
- Output format (HTML, JSON, XML, PDF)
- Rendering duration
- Rendering status (rendered, error)
- Template data size
- Output size
- Template locals/data (if enabled)
- Cache hit status
- Error messages

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    view: {
      enabled: true,
      captureData: false, // Set to true to capture template locals
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable view tracking |
| `captureData` | boolean | `false` | Capture template data/locals |

## Payload Structure

```typescript
interface ViewEntry {
  type: 'view';
  payload: {
    template: string;           // Template name/path
    format: 'html' | 'json' | 'xml' | 'pdf';
    duration: number;           // Render time (ms)
    status: 'rendered' | 'error';
    dataSize?: number;          // Input data size (bytes)
    outputSize?: number;        // Rendered output size (bytes)
    locals?: Record<string, unknown>; // Template data (if captureData: true)
    cacheHit?: boolean;         // Template cache hit
    error?: string;             // Error message
  };
}
```

## Usage Example

### Setup View Engine

```typescript
// Install: npm install hbs
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(3000);
}
```

### Provide View Engine to NestLens

```typescript
import { NESTLENS_VIEW_ENGINE } from 'nestlens';

@Module({
  providers: [
    {
      provide: NESTLENS_VIEW_ENGINE,
      useFactory: (app: NestExpressApplication) => app.engine,
      inject: [/* app instance */],
    },
  ],
})
export class AppModule {}
```

### Rendering Templates

```typescript
@Controller()
export class AppController {
  @Get()
  @Render('index')
  getIndex() {
    // Automatically tracked
    return {
      title: 'Welcome',
      message: 'Hello World',
    };
  }

  @Get('user/:id')
  @Render('user-profile')
  async getUserProfile(@Param('id') id: string) {
    const user = await this.userService.findOne(id);
    return {
      user,
      timestamp: new Date(),
    };
  }
}
```

### Manual Rendering

```typescript
@Controller()
export class ReportController {
  @Get('report')
  async generateReport(@Res() res: Response) {
    const data = await this.reportService.getData();

    // Tracked when rendered
    res.render('report', {
      data,
      generatedAt: new Date(),
    });
  }
}
```

## Dashboard View

In the NestLens dashboard, view entries show:

- Template rendering timeline
- Most rendered templates
- Slow templates
- Rendering performance trends
- Output size distribution
- Cache hit rates
- Error rates

## Performance Analysis

### Identify Slow Templates

```typescript
// Dashboard shows which templates are slow to render
@Get('complex')
@Render('complex-report')
async complexReport() {
  // If this takes >500ms, it appears in "Slow Views"
  const data = await this.generateComplexData();
  return { data };
}
```

### Monitor Output Sizes

```typescript
// Dashboard tracks output size
@Get('large-list')
@Render('user-list')
async userList() {
  const users = await this.userService.findAll();
  // Dashboard shows if rendered output is very large
  return { users };
}
```

## Template Formats

The watcher auto-detects format from template name:

```typescript
@Render('report.pdf')     // format: 'pdf'
@Render('data.xml')       // format: 'xml'
@Render('api.json')       // format: 'json'
@Render('page.html')      // format: 'html' (default)
```

## Template Data Capture

When `captureData: true`, template locals are captured (limited to 4KB):

```typescript
NestLensModule.forRoot({
  watchers: {
    view: {
      captureData: true,
    },
  },
})

@Get()
@Render('index')
getIndex() {
  return {
    user: { id: 123, name: 'John' }, // Captured in dashboard
    settings: { theme: 'dark' },
  };
}
```

## Cache Tracking

Track template caching effectiveness:

```typescript
// Some view engines cache compiled templates
// Dashboard shows cache hit rates
@Get('cached')
@Render('frequently-used-template')
getData() {
  // Subsequent renders show cacheHit: true
  return { data: 'value' };
}
```

## Error Handling

```typescript
@Get('user/:id')
@Render('user-profile')
async getUserProfile(@Param('id') id: string) {
  try {
    const user = await this.userService.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { user };
  } catch (error) {
    // Rendering error tracked automatically
    throw error;
  }
}
```

## Related Watchers

- [Request Watcher](./request) - See which requests triggered view renders
- [Query Watcher](./query) - See database queries used to build view data
