/**
 * The line NestLens prints when it starts.
 *
 * It used to say `NestLens initialized`, which is true and says nothing. An
 * application reported four configuration mistakes found by reading Redis and
 * this library's source — entries in database 0 while `db: 1` was configured,
 * a store recording health checks and nothing else, a webhook that could not
 * fire — and three of the four are visible here the moment the process starts.
 */
import { startupSummary } from '../startup-summary';
import { NestLensConfig } from '../nestlens.config';

describe('the startup summary', () => {
  it('says it is recording everything by default', () => {
    expect(startupSummary({})).toContain('recording everything');
  });

  it('says what a rate of zero really keeps', () => {
    const line = startupSummary({ sampling: { rate: 0, always: ['exception', 'graphql'] } });

    expect(line).toContain('only what `always` names (exception+graphql)');
  });

  it('says the percentage when there is one', () => {
    expect(startupSummary({ sampling: { rate: 0.1 } })).toContain('sampling 10% of requests');
  });

  it('names the Redis database, which is where an entry goes missing', () => {
    const line = startupSummary({
      storage: { driver: 'redis', redis: { url: 'redis://host:6379', db: 1 } },
    });

    expect(line).toContain('redis storage on db 1');
  });

  it('reads the database out of the URL when that is where it is', () => {
    const line = startupSummary({
      storage: { driver: 'redis', redis: { url: 'redis://host:6379/4' } },
    });

    expect(line).toContain('redis storage on db 4');
  });

  it('names the SQLite file', () => {
    const line = startupSummary({
      storage: { driver: 'sqlite', sqlite: { filename: '/data/nestlens.db' } },
    });

    expect(line).toContain('/data/nestlens.db');
  });

  it('says both bounds on what is kept', () => {
    const line = startupSummary({
      pruning: { maxAge: 336 },
      storage: { maxEntries: 50_000 },
    });

    // The two units side by side, which is where a reader loses them.
    expect(line).toContain('keeping 336h or 50,000 entries, pruning every 60m');
  });

  it('says when pruning is off', () => {
    expect(startupSummary({ pruning: { enabled: false } })).toContain('pruning off');
  });

  it('counts the webhooks', () => {
    const line = startupSummary({
      alerting: { enabled: true, webhooks: [{ url: 'http://a' }, { url: 'http://b' }] },
    });

    expect(line).toContain('2 alerting webhooks');
  });

  it('says nothing about alerting when there is none', () => {
    expect(startupSummary({})).not.toContain('webhook');
  });

  it('says where the dashboard is when it has a listener of its own', () => {
    const line = startupSummary({ server: { host: '0.0.0.0', port: 3001 }, path: '/nestlens' });

    expect(line).toContain('dashboard on 0.0.0.0:3001/nestlens, not mounted on the application');
  });

  it('says where it is mounted otherwise', () => {
    expect(startupSummary({ path: '/admin/monitoring' })).toContain(
      'dashboard mounted at /admin/monitoring',
    );
  });

  it('reads as one line', () => {
    const line = startupSummary({
      preset: 'failures-only',
      sampling: { rate: 0, always: ['exception', 'graphql'] },
      storage: { driver: 'redis', redis: { url: 'redis://host:6379', db: 1 } },
      pruning: { maxAge: 336 },
      alerting: { enabled: true, webhooks: [{ url: 'http://a' }] },
      server: { host: '0.0.0.0', port: 3001 },
    } as NestLensConfig);

    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('·');
  });
});
