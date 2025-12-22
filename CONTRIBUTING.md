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
3. Install dependencies:
   ```bash
   npm install
   cd dashboard && npm install && cd ..
   ```
4. Run tests to ensure everything works:
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

## Reporting Issues

When reporting issues, please include:
- NestJS version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
