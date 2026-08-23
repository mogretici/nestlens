/**
 * Documentation consistency guard.
 *
 * The docs drifted from the code in the past (e.g. "18 watchers" while the code
 * had 19, "SQLite by default" while the default is in-memory). This test ties the
 * drift-prone, code-derivable facts back to the source of truth so the docs cannot
 * silently fall out of sync again — if someone adds a watcher or changes a default,
 * this test fails until the docs are updated.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG } from '../../nestlens.config';
import { GRAPHQL_DEFAULTS } from '../../watchers/graphql/types';
import { DataMaskerService } from '../../core/data-masker.service';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const docsDir = join(REPO_ROOT, 'docs', 'docs');

function readDoc(relPath: string): string {
  const full = join(docsDir, relPath);
  return readFileSync(full, 'utf8');
}

describe('Documentation consistency with code', () => {
  // The canonical watcher set, derived from the code (not hard-coded here).
  const watcherKeys = Object.keys(DEFAULT_CONFIG.watchers ?? {});
  const watcherCount = watcherKeys.length;

  it('has a non-trivial, code-derived watcher count', () => {
    // Sanity: guards against an empty/partial DEFAULT_CONFIG breaking the asserts below.
    expect(watcherCount).toBeGreaterThanOrEqual(19);
  });

  describe('watcher count is documented correctly', () => {
    it('intro.md states the correct watcher count and not the old "18"', () => {
      const intro = readDoc('intro.md');
      expect(intro).toContain(`${watcherCount} watchers`);
      expect(intro).not.toMatch(/18 watchers/);
    });

    it('basic-config.md lists every watcher key from the code', () => {
      const basicConfig = readDoc('configuration/basic-config.md');
      const missing = watcherKeys.filter((key) => !basicConfig.includes(`${key}:`));
      expect(missing).toEqual([]);
    });
  });

  describe('default storage driver is documented correctly', () => {
    it("the code default is 'memory'", () => {
      expect(DEFAULT_CONFIG.storage?.driver).toBe('memory');
    });

    it('watchers/overview.md does not claim SQLite is the default', () => {
      const overview = readDoc('watchers/overview.md');
      expect(overview).not.toMatch(/SQLite by default/i);
    });
  });

  describe('rate limiting default is documented correctly', () => {
    it('the code default is disabled (false)', () => {
      expect(DEFAULT_CONFIG.rateLimit).toBe(false);
    });
  });

  describe('no stale numbers linger', () => {
    it('the old hard-coded test count is gone from intro.md', () => {
      const intro = readDoc('intro.md');
      expect(intro).not.toMatch(/1,312 tests/);
    });
  });

  /**
   * `maxResponseSize` was documented as "maximum response size to capture" and
   * nothing else, so raising it looked free. Someone set it to 5MB in
   * production, where every captured response of that size blocked the event
   * loop for tens of milliseconds. The option is only safe to expose if the
   * page exposing it says what it costs.
   */
  describe('the cost of raising maxResponseSize is documented', () => {
    const graphql = () => readDoc('watchers/graphql.md');

    it('states the default in bytes', () => {
      const { maxResponseSize } = GRAPHQL_DEFAULTS;
      expect(maxResponseSize).toBe(65536);
      expect(graphql()).toContain(`\`${maxResponseSize}\``);
    });

    it('carries measured per-operation costs rather than an adjective', () => {
      const doc = graphql();

      expect(doc).toMatch(/cost per operation/i);
      // The rows the table is useless without: the small case and the one that
      // caused the incident.
      expect(doc).toMatch(/70 KB/);
      expect(doc).toMatch(/4900 KB/);
      expect(doc).toMatch(/~27 ms/);
    });

    it('points at the benchmark that produced the figures', () => {
      expect(graphql()).toContain('benchmark:sanitizer');
    });
  });

  /**
   * `server` takes the dashboard off the application's socket, and the reason
   * to reach for it is a security one. Undocumented, everyone keeps the mounted
   * default — which is the arrangement the option exists to replace.
   */
  describe('the separate listener is documented', () => {
    it('is absent by default in the code', () => {
      expect(DEFAULT_CONFIG.server).toBeUndefined();
    });

    it('basic-config.md carries the option and says the address has no default', () => {
      const doc = readDoc('configuration/basic-config.md');

      expect(doc).toContain('server?: DashboardServerConfig');
      expect(doc).toMatch(/`host` has no default/);
    });

    it('the security page says authorization is still enforced there', () => {
      const doc = readDoc('security/network-isolation.md');

      expect(doc).toMatch(/allowedIps/);
      expect(doc).toMatch(/canAccess/);
    });
  });

  /**
   * The one change in 0.10.0 a user can see without reading the release notes:
   * a field that used to arrive as `***` now arrives readable.
   */
  describe('the narrowed GraphQL variable masking is documented', () => {
    const graphql = () => readDoc('watchers/graphql.md');

    it('says a term matches whole words', () => {
      expect(graphql()).toMatch(/matches whole words/i);
    });

    it('keeps the example of a name that no longer masks', () => {
      expect(graphql()).toContain('tokenCount');
    });

    it('names the plural forms that are covered', () => {
      // Narrowing to whole words dropped these on its first cut, which is a
      // worse failure than the over-matching it was fixing.
      const text = graphql();

      expect(text).toContain('tokens');
      expect(text).toContain('apiKeys');
    });

    it("says the watcher's list is the whole of the masking for GraphQL", () => {
      // The collector does not walk a marked payload, so a reader who assumes
      // there is a second pass behind this list will configure a leak.
      expect(graphql()).toMatch(/whole of the masking/i);
    });

    it('documents how to narrow the list', () => {
      const text = graphql();

      expect(text).toContain('{ replace:');
      expect(readDoc('security/data-masking.md')).toContain('{ replace:');
    });

    it("lists the collector's defaults that the watcher now carries", () => {
      // Named in the docs because they used to be masked by a pass that no
      // longer runs, and a reader auditing the list would not otherwise expect
      // them to be in it.
      const text = graphql();

      for (const term of ['cvv', 'card_number', 'social_security']) {
        expect(text).toContain(term);
      }
    });
  });

  describe('the limits of masking are documented', () => {
    const masking = () => readDoc('security/data-masking.md');

    /**
     * The overview promised *credit card numbers and personal data*. Card
     * numbers are masked by name; an email address, a phone number and a date
     * of birth are not — and a reader deploying this in production reads that
     * line as a promise about their users' data.
     */
    it('does not claim to mask personal data in general', () => {
      const masker = new DataMaskerService({});
      const masked = masker.maskBody({
        email: 'ada@example.com',
        phone: '+44 7700 900000',
        dateOfBirth: '1990-01-01',
      }) as Record<string, string>;

      // What the code does.
      expect(masked.email).toBe('ada@example.com');
      expect(masked.phone).toBe('+44 7700 900000');
      expect(masked.dateOfBirth).toBe('1990-01-01');

      // What the page says about it.
      const page = readDoc(join('security', 'data-masking.md'));
      expect(page).not.toMatch(/Credit card numbers and personal data/);
      expect(page).toMatch(/What it does not protect/);
      expect(page).toMatch(/sensitiveParams/);
    });

    it('says what masking cannot reach', () => {
      // Anyone storing production traffic needs to know which watchers record
      // values that no rule here can redact.
      expect(masking()).toMatch(/cannot be masked|Cannot Reach/i);
    });

    it('names the watchers whose values carry no field name', () => {
      const text = masking();

      for (const watcher of ['Query', 'Command', 'Redis', 'Cache', 'Mail']) {
        expect(text).toContain(watcher);
      }
    });

    it('says webhooks are sent the masked entry', () => {
      // Alerting sends data out of the process; a reader has to know whether
      // what leaves is redacted.
      expect(masking()).toMatch(/webhooks[\s\S]{0,120}after.{0,20}masking/i);
    });

    it('says that URLs and connection strings are masked', () => {
      const text = masking();

      expect(text).toContain('connectionString');
      expect(text).toMatch(/query strings inside urls/i);
    });
  });

  describe('the cost of leaving NestLens running is documented', () => {
    const performance = () => readDoc('advanced/performance.md');

    it('carries a concurrency figure, not only a serial one', () => {
      // The serial latency number reads as "NestLens is free", and under 32
      // connections it was costing 85% of throughput. One number without the
      // other is how that went unnoticed.
      expect(performance()).toMatch(/benchmark:load/);
      expect(performance()).toMatch(/concurren/i);
    });

    it('names the idle cost, which is the question behind leaving it on', () => {
      expect(performance()).toMatch(/idle cpu/i);
    });

    it('documents sampling and what it does to correlation', () => {
      const text = performance();

      expect(text).toContain('sampling');
      // The property that makes it usable: whole requests, not scattered
      // entries.
      expect(text).toMatch(/kept\s*\n?\s*together or dropped together/);
    });

    it('says a settings block does not switch a watcher off', () => {
      expect(performance()).toMatch(/never turns a watcher off/i);
    });

    it('documents the shutdown deadline', () => {
      // An application that leaves NestLens on needs to know its shutdown is
      // bounded, and by how much.
      const text = performance();

      expect(text).toMatch(/shutting down/i);
      expect(text).toContain('three-second');
    });

    it('explains why per-request memory is off by default', () => {
      const text = performance();

      expect(text).toContain('captureMemory');
      expect(text).toMatch(/negative/i);
    });
  });

  describe('the README, which is what npm and GitHub show', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');

    it('counts the watchers the way the code does', () => {
      // Written as "requests, queries, exceptions, jobs, and N more".
      const stated = readme.match(/and (\d+) more watchers/);

      expect(stated).not.toBeNull();
      expect(Number(stated?.[1]) + 4).toBe(watcherCount);
    });

    it('links to every watcher', () => {
      const linked = new Set([...readme.matchAll(/docs\/watchers\/([a-z-]+)"/g)].map((m) => m[1]));
      linked.delete('overview');

      // The badge strip is the only place a reader sees the whole list.
      expect(linked.size).toBe(watcherCount);
    });
  });

  describe('referenced docs exist', () => {
    it.each([
      'getting-started/installation.md',
      'configuration/basic-config.md',
      'security/network-isolation.md',
      'watchers/overview.md',
      'watchers/schedule.md',
      'dashboard/keyboard-shortcuts.md',
      'dashboard/navigation.md',
    ])('%s exists', (relPath) => {
      expect(existsSync(join(docsDir, relPath))).toBe(true);
    });
  });
});
