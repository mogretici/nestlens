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

### What Is Recorded

The watcher wraps the `render` method of the object provided under
`NESTLENS_VIEW_ENGINE`, and records each call to it — one that returns the
output, a promise of it, or answers through a callback as `render(name, locals,
callback)` does. A render that answers through a callback is timed until it
calls back.

### Record `@Render()` and `res.render()` (Express)

On Express, every `@Render()` and `res.render()` goes through the Express
application's own `render`. Hand that to the watcher:

```typescript
import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NESTLENS_VIEW_ENGINE } from 'nestlens';

@Module({
  providers: [
    {
      provide: NESTLENS_VIEW_ENGINE,
      useFactory: (host: HttpAdapterHost) => host.httpAdapter.getInstance(),
      inject: [HttpAdapterHost],
    },
  ],
})
export class AppModule {}
```

Measured on NestJS 12.6 with an engine that took 25 ms: a `@Render('page')`
handler was recorded as template `page`, `rendered`, 26 ms, with the output's
size. Fastify renders through `@fastify/view`, which has no such method.

### Or Provide a View Service of Your Own

```typescript
import { Injectable, Module } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NESTLENS_VIEW_ENGINE } from 'nestlens';

@Injectable()
export class ViewService {
  render(template: string, locals: Record<string, unknown>): string {
    const source = readFileSync(join(__dirname, '..', 'views', `${template}.hbs`), 'utf8');
    return Handlebars.compile(source)(locals);
  }
}

@Module({
  providers: [
    ViewService,
    { provide: NESTLENS_VIEW_ENGINE, useExisting: ViewService },
  ],
})
export class AppModule {}
```

### Rendering Templates

```typescript
@Controller()
export class AppController {
  constructor(private readonly views: ViewService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  getIndex(): string {
    // Recorded: template 'index', format 'html', the output's size
    return this.views.render('index', { title: 'Welcome' });
  }
}
```

A render that throws — or whose promise rejects, or whose callback is handed an
error — is recorded with
`status: 'error'` and the error's message, and the error still reaches the
caller.

## Template Formats

The format is read from the template name, or from `format` in the object form:

```typescript
views.render('report.pdf', data)    // format: 'pdf'
views.render('data.xml', data)      // format: 'xml'
views.render('api.json', data)      // format: 'json'
views.render('page', data)          // format: 'html' (default)
```

## Template Data Capture

With `captureData: true` the locals are recorded too, up to 4KB; larger ones are
recorded as their size:

```typescript
NestLensModule.forRoot({
  watchers: {
    view: {
      captureData: true,
    },
  },
})
```

`cacheHit` is recorded when the object form passes one —
`render({ template, locals, cacheHit })`; the watcher cannot tell on its own.

## Related Watchers

- [Request Watcher](./request) - See which requests triggered view renders
- [Query Watcher](./query) - See database queries used to build view data
