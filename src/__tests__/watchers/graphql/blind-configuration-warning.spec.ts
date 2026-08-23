/**
 * A configuration that cannot record what it is asking for says so.
 *
 * `sampling.always` and an alerting webhook's `events` both default to
 * `['exception']`. With `recordExceptions` turned off, a GraphQL API has no
 * exceptions at all — a resolver's failure lives on its `graphql` entry — so
 * both defaults quietly keep and announce nothing.
 *
 * Reported from a deployment running exactly that: `rate: 0` with the
 * documented defaults, 2,240 entries recorded, every one a health check,
 * `exceptions: 0`, and a webhook that never fired. Nothing warned at any layer.
 */
import { Logger } from '@nestjs/common';
import { CollectorService } from '../../../core/collector.service';
import { NestLensConfig } from '../../../nestlens.config';
import { GraphQLWatcher } from '../../../watchers/graphql/graphql.watcher';

const startWith = (config: NestLensConfig): string[] => {
  const warnings: string[] = [];
  const spy = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation((message: unknown) => void warnings.push(String(message)));

  const collector = {
    collect: async () => undefined,
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new GraphQLWatcher(collector, config, {
    get: () => undefined,
  } as never);

  watcher.onModuleInit();
  watcher.onModuleDestroy();
  spy.mockRestore();

  return warnings.filter((warning) => warning.includes('recordExceptions'));
};

const off = { enabled: true, recordExceptions: false };

describe('watching GraphQL with exceptions turned off', () => {
  it('says so when sampling keeps only exceptions', () => {
    const warnings = startWith({
      watchers: { graphql: off },
      sampling: { rate: 0 },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('sampling.always');
  });

  it('says so when a webhook announces only exceptions', () => {
    const warnings = startWith({
      watchers: { graphql: off },
      alerting: { enabled: true, webhooks: [{ url: 'http://alerts.test/hook' }] },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('alerting webhook');
  });

  it('names both when both are blind', () => {
    const warnings = startWith({
      watchers: { graphql: off },
      sampling: { rate: 0.5 },
      alerting: { enabled: true, webhooks: [{ url: 'http://alerts.test/hook' }] },
    });

    expect(warnings[0]).toContain('`sampling.always` and an alerting webhook');
  });

  it('stays quiet when graphql is named too', () => {
    const warnings = startWith({
      watchers: { graphql: off },
      sampling: { rate: 0, always: ['exception', 'graphql'] },
      alerting: {
        enabled: true,
        webhooks: [{ url: 'http://alerts.test/hook', events: ['exception', 'graphql'] }],
      },
    });

    expect(warnings).toHaveLength(0);
  });

  it('stays quiet with the defaults, where exceptions are recorded', () => {
    // `recordExceptions` on is the default, and then `['exception']` means what
    // it says on GraphQL too.
    const warnings = startWith({
      watchers: { graphql: true },
      sampling: { rate: 0 },
      alerting: { enabled: true, webhooks: [{ url: 'http://alerts.test/hook' }] },
    });

    expect(warnings).toHaveLength(0);
  });

  it('stays quiet when nothing narrows what is kept', () => {
    // No sampling and no webhooks: nothing is being asked for, so there is
    // nothing to be wrong about.
    const warnings = startWith({ watchers: { graphql: off } });

    expect(warnings).toHaveLength(0);
  });
});
