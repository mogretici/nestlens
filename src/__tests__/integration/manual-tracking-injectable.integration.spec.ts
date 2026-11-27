/**
 * A watcher's manual API can be taken in a constructor, whether it is on or not.
 *
 * `trackCheck`, `trackDump`, `trackBatch`, `setupQueue`, `setupPrismaClient`
 * and the rest are documented as things a service calls, and every page showed
 * the watcher as a constructor parameter. `NestLensModule` exported none of
 * them, so that service did not boot — measured on NestJS 12.6:
 *
 *     Nest can't resolve dependencies of the S (?). Please make sure that the
 *     argument GateWatcher at index [0] is available in the M module.
 *
 * And a watcher that was switched off was not provided at all, so the same
 * service would have stopped booting the day someone set `gate: false`. These
 * boot an application with a feature module that takes each watcher, with the
 * watcher on, off, and NestLens off, and check that "off" records nothing and
 * installs nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Injectable, Module, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { EventEmitter } from 'events';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { NestLensModule } from '../../nestlens.module';
import {
  BatchWatcher,
  CacheWatcher,
  CommandWatcher,
  DumpWatcher,
  EventWatcher,
  GateWatcher,
  HttpClientWatcher,
  JobWatcher,
  MailWatcher,
  ModelWatcher,
  NotificationWatcher,
  RedisWatcher,
  ViewWatcher,
  NestLensLogger,
} from '../../index';

const WATCHERS: Array<[keyof NonNullable<NestLensConfig['watchers']>, Type<unknown>]> = [
  ['gate', GateWatcher],
  ['dump', DumpWatcher],
  ['batch', BatchWatcher],
  ['job', JobWatcher],
  ['model', ModelWatcher],
  ['httpClient', HttpClientWatcher],
  ['mail', MailWatcher],
  ['cache', CacheWatcher],
  ['event', EventWatcher],
  ['redis', RedisWatcher],
  ['notification', NotificationWatcher],
  ['view', ViewWatcher],
  ['command', CommandWatcher],
  // Not a watcher with a manual API, but the same promise: the docs pair
  // `enabled: process.env.NODE_ENV !== 'production'` with
  // `app.useLogger(app.get(NestLensLogger))`, which has to boot in production.
  ['log', NestLensLogger],
];

/** A feature module whose service takes `watcher` by constructor. */
const featureTaking = (watcher: Type<unknown>) => {
  @Injectable()
  class Consumer {
    constructor(readonly watcher: unknown) {}
  }
  Reflect.defineMetadata('design:paramtypes', [watcher], Consumer);

  @Module({ providers: [Consumer], exports: [Consumer] })
  class FeatureModule {}

  return { Consumer, FeatureModule };
};

const boot = async (config: NestLensConfig, watcher: Type<unknown>) => {
  const { Consumer, FeatureModule } = featureTaking(watcher);
  const moduleRef = await Test.createTestingModule({
    imports: [NestLensModule.forRoot(config), FeatureModule],
  }).compile();
  await moduleRef.init();

  return { app: moduleRef, consumer: moduleRef.get(Consumer) };
};

describe('a watcher taken by constructor in a feature module', () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  describe.each([
    ['switched on', (key: string): NestLensConfig => ({ watchers: { [key]: true } })],
    ['switched off', (key: string): NestLensConfig => ({ watchers: { [key]: false } })],
    ['with NestLens off', (): NestLensConfig => ({ enabled: false })],
  ])('%s', (_label, configFor) => {
    it.each(WATCHERS)('%s boots and is handed the watcher', async (key, watcher) => {
      const { app, consumer } = await boot(configFor(key), watcher);

      expect(consumer.watcher).toBeInstanceOf(watcher);
      await app.close();
    });
  });

  it.each([
    ['the log watcher off', { watchers: { log: false } } as NestLensConfig],
    ['NestLens off', { enabled: false } as NestLensConfig],
  ])('hands NestLensLogger to app.get with %s, and it still prints', async (_label, config) => {
    const { app } = await boot(config, GateWatcher);
    const logger = app.get(NestLensLogger);
    const collect = vi.spyOn(CollectorService.prototype, 'collect');
    const print = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.log('still printed', 'Probe');

    const printed = print.mock.calls.map(([chunk]) => String(chunk)).join('');
    print.mockRestore();
    expect(printed).toContain('still printed');
    expect(collect).not.toHaveBeenCalled();
    collect.mockRestore();
    await app.close();
  });

  describe.each([
    [
      'switched off',
      {
        watchers: {
          gate: false,
          dump: false,
          batch: false,
          job: false,
          model: false,
          httpClient: false,
          mail: false,
        },
      } as NestLensConfig,
    ],
    ['with NestLens off', { enabled: false } as NestLensConfig],
  ])('%s, the manual API does nothing', (_label, config) => {
    let collect: MockInstance;

    beforeEach(() => {
      collect = vi.spyOn(CollectorService.prototype, 'collect');
    });

    afterEach(() => collect.mockRestore());

    it('records no manual entry', async () => {
      const gate = await boot(config, GateWatcher);
      (gate.consumer.watcher as GateWatcher).trackCheck('g', 'a', 'Post', true);
      const dump = await boot(config, DumpWatcher);
      (dump.consumer.watcher as DumpWatcher).trackDump('export', 'json', 1, 'completed');
      const batch = await boot(config, BatchWatcher);
      (batch.consumer.watcher as BatchWatcher).trackBatch('b', 'import', 1, 1, 0, 1);

      expect(collect).not.toHaveBeenCalled();
      await Promise.all([gate.app.close(), dump.app.close(), batch.app.close()]);
    });

    it('installs nothing on what it is handed', async () => {
      const job = await boot(config, JobWatcher);
      const queue = Object.assign(new EventEmitter(), { name: 'q' });
      (job.consumer.watcher as JobWatcher).setupQueue(queue, 'q');
      expect(queue.eventNames()).toEqual([]);

      const model = await boot(config, ModelWatcher);
      const prisma = { $use: vi.fn(), $extends: vi.fn() };
      expect((model.consumer.watcher as ModelWatcher).setupPrismaClient(prisma)).toBe(prisma);
      expect(prisma.$use).not.toHaveBeenCalled();
      expect(prisma.$extends).not.toHaveBeenCalled();

      const http = await boot(config, HttpClientWatcher);
      const client = axios.create();
      (http.consumer.watcher as HttpClientWatcher).setupInterceptors(client);
      expect(
        (client.interceptors.request as unknown as { handlers: unknown[] }).handlers,
      ).toHaveLength(0);

      const mail = await boot(config, MailWatcher);
      const mailer = { sendMail: async () => ({}) };
      const before = mailer.sendMail;
      (mail.consumer.watcher as MailWatcher).setupMailer(mailer);
      expect(mailer.sendMail).toBe(before);

      await Promise.all([job.app.close(), model.app.close(), http.app.close(), mail.app.close()]);
    });
  });
});
