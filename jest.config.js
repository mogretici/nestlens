/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // path-to-regexp 9 is ESM-only, and `@fastify/middie` >= 9.3.7 (which
  // `@nestjs/platform-fastify` 11.2.12 pins) loads it with require(). Node
  // allows that since 20.19 and 22.12; Jest's module runtime does not, so that
  // one package is compiled to CommonJS here and everything else in
  // node_modules is still left alone. The nested `(.*/node_modules/)?` lets the
  // copy installed under `@fastify/middie/node_modules` through as well.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '/node_modules/(.*/node_modules/)?path-to-regexp/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true }, diagnostics: false },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(.*/node_modules/)?path-to-regexp/)'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
