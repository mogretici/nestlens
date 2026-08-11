import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const EXAMPLE_DIR = path.join(__dirname, '..', 'example');
const APP_URL = 'http://localhost:3000';

/**
 * Asking for queries rather than requests is the whole point of this URL.
 *
 * Playwright waits for the application to answer before running anything, and
 * that health check is itself an HTTP request the request watcher records. A
 * check for "any request entry" is therefore true on a completely cold app,
 * which skipped seeding every time and left the suite passing only because a
 * long-lived dev server still held data from earlier runs. Restarting it turned
 * green into "element(s) not found".
 *
 * Nothing the harness does on its way in produces a query, so this answers the
 * question actually being asked: has the application done any real work yet?
 */
const QUERIES_URL = `${APP_URL}/nestlens/__nestlens__/api/entries?type=query&limit=1`;

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
  const response = await fetch(QUERIES_URL);
  if (!response.ok) {
    throw new Error(`Example app is not answering on ${APP_URL} (${response.status}).`);
  }

  const { data } = (await response.json()) as { data: unknown[] };

  // Re-seeding an already-populated app only slows the run down.
  if (Array.isArray(data) && data.length > 0) {
    return;
  }

  // Reporters own stdout — the JSON one emits a single document there, and a
  // progress line printed alongside it makes the report unparseable.
  process.stderr.write('[e2e] seeding the example app\n');

  await run('bash', ['test-requests.sh', APP_URL], { cwd: EXAMPLE_DIR, timeout: 120_000 });
}

export default seedExampleApp;
