---
sidebar_position: 1
---

# Installation

## Requirements

- Node.js >= 18.0.0
- NestJS >= 9.0.0 (supports 9, 10, 11)
- TypeScript >= 4.7

## Install via npm

```bash npm2yarn
npm install nestlens
```

## Peer Dependencies

NestLens uses these peer dependencies (likely already in your NestJS project):

- `@nestjs/common` ^9.0.0 || ^10.0.0 || ^11.0.0
- `@nestjs/core` ^9.0.0 || ^10.0.0 || ^11.0.0
- `reflect-metadata` ^0.1.13 || ^0.2.0
- `rxjs` ^7.0.0

## Included Dependencies

NestLens bundles:
- `better-sqlite3` - Local SQLite storage
- `uuid` - Request ID generation

## Verify Installation

After installation, verify it's working:

```bash
npm ls nestlens
```
