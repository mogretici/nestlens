# Contributing to NestLens

Thank you for your interest in contributing to NestLens! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nestlens.git
   cd nestlens
   ```
3. Use the npm the repository pins: **npm@11.21.3**. Every `package.json` with
   a lockfile names exactly that version, in `packageManager` and in
   `devEngines`, and CI installs it on every Node it tests. Lockfiles written by
   any other npm do not agree with it — an npm 11 lock has failed `npm ci` on
   npm 10, npm 10.9 has crashed resolving the dashboard, and npm 11.6.2 and
   11.21.3 write the example's lockfile differently — so npm 10.9 and later
   refuse to run here at all unless they are that version (`EBADDEVENGINES`).
   Node itself has to be 22.13 or later, which is what `engines` asks for; the
   test suite (Vitest, on Vite 8) needs 22.12.

   Pick the line that matches how Node is installed:

   - **nvm, fnm or Homebrew** (macOS, Linux): the global directory is yours, so
     npm can replace itself.
     ```bash
     npm install --global npm@11.21.3
     ```
   - **A distribution package** (`apt`, `dnf`, …): the global directory belongs
     to root. Rather than `sudo npm`, let Corepack provide npm from a directory
     you own, ahead of `/usr/bin` on `PATH`. If `corepack` is missing — Node 25
     and later no longer ship it, and some distributions package it separately
     — the first line installs it; otherwise skip it.
     ```bash
     npm install --global --prefix ~/.local corepack
     ~/.local/bin/corepack enable --install-directory ~/.local/bin npm
     ```
   - **Windows, from the nodejs.org installer**: `npm install --global npm@…`
     lands in `%AppData%\npm`, which comes after `C:\Program Files\nodejs` on
     `PATH`, so the npm Node shipped keeps answering. Use Corepack from an
     administrator terminal instead; it replaces the shims next to `node.exe`.
     ```powershell
     corepack enable npm
     ```
     Or install Node through nvm-windows, whose Node directory is yours, and
     use the first line.

   With Corepack, npm follows `packageManager` in each directory and downloads
   the pinned version the first time it runs here. Either way, check from the
   repository root before installing anything:
   ```bash
   npm --version   # 11.21.3
   ```
4. Install dependencies:
   ```bash
   npm install
   cd dashboard && npm install && cd ..
   ```
5. Run tests to ensure everything works:
   ```bash
   npm test
   cd dashboard && npm test
   ```

## Development Workflow

### Running in Development

```bash
# Start the example app with NestLens
cd example && npm run start:dev

# Start the dashboard in dev mode
cd dashboard && npm run dev
```

### Running Tests

```bash
# Backend tests
npm test

# Dashboard tests
cd dashboard && npm test

# E2E tests (requires servers running)
npm run test:e2e

# With coverage
npm test -- --coverage
```

### Building

```bash
npm run build
```

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards:
   - Use TypeScript strict mode
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. Ensure all tests pass:
   ```bash
   npm test
   cd dashboard && npm test
   ```

4. Commit with descriptive messages:
   ```bash
   git commit -m "feat: add new watcher for X"
   ```

5. Push and create a Pull Request

6. Expect the checks to wait. On a pull request from a fork, GitHub holds every
   workflow run until a maintainer approves it, and holds it again after each
   push. Checks that sit idle on a fresh commit are waiting for that approval,
   not failing.

## Coding Standards

- **TypeScript**: Use strict types, avoid `any`
- **Testing**: Follow AAA pattern (Arrange, Act, Assert)
- **Comments**: Document complex logic
- **Security**: Never log sensitive data

## Adding a New Watcher

1. Create the watcher file in `src/watchers/`
2. Define the entry type in `src/types/entry.types.ts`
3. Register in `src/watchers/index.ts`
4. Add to `NestLensModule` providers
5. Create dashboard page in `dashboard/src/pages/`
6. Add tests in `src/__tests__/watchers/`

## Adding an API Endpoint

Every route under `__nestlens__/api` is also a tool for AI agents, through the
`nestlens-mcp` server. Decorate the handler and it is one — nothing else changes:

```typescript
@NestLensTool({ description: 'What it returns or changes, and when to use it.' })
@Get('entries/recent')
async getRecentEntries(@Query() query: RecentQueryDto, @Res() _res?: unknown) { ... }
```

The tool is named after the method, and its parameters are read from the DTOs the
handler already validates with. `src/__tests__/api/tools/tool-coverage.spec.ts`
fails for a route that is neither decorated nor excluded on purpose. A new
controller under `__nestlens__/api` also has to be added to the list in
`NestLensApiController.getTools`.

## Reporting Issues

When reporting issues, please include:
- NestJS version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
