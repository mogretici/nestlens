import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const EXAMPLE_DIR = path.join(__dirname, '..', 'example');
const APP_URL = 'http://localhost:3000';
// Checked by type: the app records its own startup logs, so "any entries at
// all" is always true and would skip seeding every time.
const REQUESTS_URL = `${APP_URL}/nestlens/__nestlens__/api/entries?type=request&limit=1`;

/**
 * Fills the example application with entries before the suite runs.
 *
 * Most specs assert on rows: a request's details, a query's SQL, an
 * exception's stack. Against an empty application those locators never
 * resolve and the tests fail on timeout — which reads as a broken dashboard
 * rather than missing fixtures, and takes 30 seconds each to say so.
 *
 * `test-requests.sh` is the same generator used by hand during development,
 * so the data here matches what a developer sees.
 */
async function seedExampleApp(): Promise<void> {
  const response = await fetch(REQUESTS_URL);
  if (!response.ok) {
    throw new Error(`Example app is not answering on ${APP_URL} (${response.status}).`);
  }

  const { data } = (await response.json()) as { data: unknown[] };

  // Re-seeding an already-populated app only slows the run down.
  if (Array.isArray(data) && data.length > 0) {
    return;
  }

  process.stdout.write('[e2e] seeding the example app\n');

  await run('bash', ['test-requests.sh', APP_URL], { cwd: EXAMPLE_DIR, timeout: 120_000 });
}

export default seedExampleApp;
