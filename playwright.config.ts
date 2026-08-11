import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/tests',
  // Most specs assert on entries; against an empty app their locators never
  // resolve and every one fails on timeout.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub runners give two cores; a single worker leaves one idle and turns a
  // three-minute local run into a twenty-minute one.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // The production spec targets the example app directly, so these skip it —
    // they would resolve its paths against the dev server's origin.
    {
      name: 'chromium',
      testIgnore: /production-serving\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /production-serving\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /production-serving\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    // The projects above load the dashboard from the Vite dev server, so they
    // never touch the code that ships: static file serving, the injected
    // `<base href>`, the SPA wildcard and the cache headers. This one drives
    // the example application, where the bundle comes out of the package the
    // same way it would in a user's app.
    //
    // It runs one focused spec rather than the whole suite. Playwright gives
    // each test a cold cache, so re-running the functional tests here would
    // re-download the ~1 MB bundle per test to re-cover what the dev-server
    // projects already cover. What only this can check is that the bytes
    // leaving the package are correct.
    //
    // Needs `npm run build` and a refreshed `example/node_modules/nestlens` to
    // mean anything — see CLAUDE.md, npm does not re-copy a `file:` dependency.
    {
      name: 'production',
      testMatch: /production-serving\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
    },
  ],

  /* Run local dev servers before starting the tests */
  webServer: [
    {
      // Watch mode only makes sense locally; on CI it just competes with the
      // test workers for the two available cores.
      command: process.env.CI ? 'cd example && npm start' : 'cd example && npm run start:dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'cd dashboard && npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
