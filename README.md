<p align="center">
  <img src="docs/static/img/logo.svg" alt="NestLens" width="80" height="80" />
</p>

<h1 align="center">NestLens</h1>

<p align="center">
  <strong>Debug NestJS Like Never Before</strong>
</p>

<p align="center">
  Laravel Telescope-inspired debugging and monitoring for NestJS.<br/>
  Track requests, queries, exceptions, jobs, and 15 more watchers<br/>
  with a beautiful real-time dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nestlens"><img src="https://img.shields.io/npm/v/nestlens.svg?style=flat-square&color=0ea5e9" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/nestlens"><img src="https://img.shields.io/npm/dm/nestlens.svg?style=flat-square&color=8b5cf6" alt="npm downloads" /></a>
  <a href="https://github.com/mogretici/nestlens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981.svg?style=flat-square" alt="license" /></a>
  <a href="https://github.com/mogretici/nestlens"><img src="https://img.shields.io/github/stars/mogretici/nestlens?style=flat-square&color=f59e0b" alt="stars" /></a>
</p>

<p align="center">
<a href="https://nestlens-docs.vercel.app/docs/getting-started/installation"><img src="https://img.shields.io/badge/Getting_Started-0ea5e9?style=for-the-badge" alt="Getting Started" /></a>
<a href="https://nestlens-docs.vercel.app/docs/configuration/basic-config"><img src="https://img.shields.io/badge/Configuration-8b5cf6?style=for-the-badge" alt="Configuration" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/overview"><img src="https://img.shields.io/badge/Watchers-10b981?style=for-the-badge" alt="Watchers" /></a>
<a href="https://nestlens-docs.vercel.app/docs/security/access-control"><img src="https://img.shields.io/badge/Security-f59e0b?style=for-the-badge" alt="Security" /></a>
</p>

<p align="center">
  <a href="https://lutfuogretici.medium.com/nestlens-laravel-telescope-finally-comes-to-nestjs-93f5a2c1f521">
    <img src="https://img.shields.io/badge/Read_the_Story_on_Medium-000000?style=for-the-badge&logo=medium" alt="Medium Article" />
  </a>
</p>

<p align="center">
  <img src="assets/nestlens.gif" alt="NestLens Dashboard Demo" width="800" />
</p>

## Why NestLens?

<div align="center">
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
</div>


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

<p align="center">
<a href="https://nestlens-docs.vercel.app/docs/watchers/request"><img src="https://img.shields.io/badge/Request-0ea5e9?style=flat-square" alt="Request" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/exception"><img src="https://img.shields.io/badge/Exception-ef4444?style=flat-square" alt="Exception" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/log"><img src="https://img.shields.io/badge/Log-8b5cf6?style=flat-square" alt="Log" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/query"><img src="https://img.shields.io/badge/Query-10b981?style=flat-square" alt="Query" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/model"><img src="https://img.shields.io/badge/Model-10b981?style=flat-square" alt="Model" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/cache"><img src="https://img.shields.io/badge/Cache-10b981?style=flat-square" alt="Cache" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/redis"><img src="https://img.shields.io/badge/Redis-dc382d?style=flat-square" alt="Redis" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/job"><img src="https://img.shields.io/badge/Job-f59e0b?style=flat-square" alt="Job" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/schedule"><img src="https://img.shields.io/badge/Schedule-f59e0b?style=flat-square" alt="Schedule" /></a>
<br/>
<a href="https://nestlens-docs.vercel.app/docs/watchers/event"><img src="https://img.shields.io/badge/Event-f59e0b?style=flat-square" alt="Event" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/batch"><img src="https://img.shields.io/badge/Batch-f59e0b?style=flat-square" alt="Batch" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/mail"><img src="https://img.shields.io/badge/Mail-ec4899?style=flat-square" alt="Mail" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/http-client"><img src="https://img.shields.io/badge/HTTP_Client-ec4899?style=flat-square" alt="HTTP Client" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/notification"><img src="https://img.shields.io/badge/Notification-ec4899?style=flat-square" alt="Notification" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/gate"><img src="https://img.shields.io/badge/Gate-64748b?style=flat-square" alt="Gate" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/command"><img src="https://img.shields.io/badge/Command-64748b?style=flat-square" alt="Command" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/view"><img src="https://img.shields.io/badge/View-64748b?style=flat-square" alt="View" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/dump"><img src="https://img.shields.io/badge/Dump-64748b?style=flat-square" alt="Dump" /></a>
<a href="https://nestlens-docs.vercel.app/docs/watchers/graphql"><img src="https://img.shields.io/badge/GraphQL-e10098?style=flat-square" alt="GraphQL" /></a>
</p>

<br/>

<p align="center">
  <sub>Made by <a href="https://github.com/mogretici">Lütfü Öğretici</a> for the NestJS community</sub>
</p>
