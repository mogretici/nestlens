<p align="center">
  <img src="docs/static/img/logo.svg" alt="NestLens" width="80" height="80" />
</p>

<h1 align="center">NestLens</h1>

<p align="center">
  <strong>Debug NestJS Like Never Before</strong>
</p>

<p align="center">
  Laravel Telescope-inspired debugging and monitoring for NestJS.<br/>
  Track requests, queries, exceptions, jobs, and 14 more watchers<br/>
  with a beautiful real-time dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nestlens"><img src="https://img.shields.io/npm/v/nestlens.svg?style=flat-square&color=0ea5e9" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/nestlens"><img src="https://img.shields.io/npm/dm/nestlens.svg?style=flat-square&color=8b5cf6" alt="npm downloads" /></a>
  <a href="https://github.com/mogretici/nestlens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981.svg?style=flat-square" alt="license" /></a>
  <a href="https://github.com/mogretici/nestlens"><img src="https://img.shields.io/github/stars/mogretici/nestlens?style=flat-square&color=f59e0b" alt="stars" /></a>
</p>

<p align="center">
  <a href="https://nestlens-docs.vercel.app"><strong>Documentation</strong></a> ·
  <a href="https://nestlens-docs.vercel.app/docs/getting-started/installation"><strong>Getting Started</strong></a> ·
  <a href="https://github.com/mogretici/nestlens/issues"><strong>Report Bug</strong></a>
</p>

<br/>

## Install

```bash
npm install nestlens
```

## Quick Start

```typescript
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

Visit **http://localhost:3000/nestlens** and start debugging.

<br/>

## Why NestLens?

<table>
<tr>
<td width="33%" valign="top">

### ⚡ Real-time Monitoring

Watch requests, queries, and exceptions as they happen. No more console.log debugging.

</td>
<td width="33%" valign="top">

### ✨ Zero Configuration

Import and go. Auto-detects TypeORM, Prisma, Bull, and more. No setup required.

</td>
<td width="33%" valign="top">

### 🔒 Security Built-in

IP whitelist, role-based access, and automatic data masking for production safety.

</td>
</tr>
</table>

<br/>

## 18 Watchers

Track everything your NestJS application does:

| Category | Watchers |
|----------|----------|
| **HTTP & Errors** | Request · Exception · Log |
| **Database** | Query · Cache · Redis · Model |
| **Background** | Job · Schedule · Event · Batch |
| **Communication** | Mail · HTTP Client · Notification |
| **System** | Gate · Command · View · Dump |

<p align="right">
  <a href="https://nestlens-docs.vercel.app/docs/watchers/overview">See all watchers →</a>
</p>

<br/>

## Integrations

Works out of the box with your existing stack:

- **TypeORM** - Query & Model tracking
- **Prisma** - Query & Model tracking
- **Bull / BullMQ** - Job monitoring
- **Redis** - Command tracking

<p align="right">
  <a href="https://nestlens-docs.vercel.app/docs/integrations/typeorm">View integrations →</a>
</p>

<br/>

## Documentation

| | |
|---|---|
| [**Getting Started**](https://nestlens-docs.vercel.app/docs/getting-started/installation) | Installation and quick start guide |
| [**Configuration**](https://nestlens-docs.vercel.app/docs/configuration/basic-config) | All configuration options |
| [**Watchers**](https://nestlens-docs.vercel.app/docs/watchers/overview) | 18 watchers documentation |
| [**Security**](https://nestlens-docs.vercel.app/docs/security/access-control) | Access control and data masking |

<br/>

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

<br/>

## License

MIT © [Lütfü Öğretici](https://github.com/mogretici)

<br/>

<p align="center">
  <sub>Built with ❤️ for the NestJS community</sub>
</p>
