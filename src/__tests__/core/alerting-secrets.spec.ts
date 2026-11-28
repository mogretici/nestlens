/**
 * A webhook's URL is its credential, and a log line must not carry it.
 *
 * Telegram puts the bot token in the path (`/bot<token>/sendMessage`), and
 * Slack's and Discord's webhook secrets are the path. A failed delivery logged
 * `Webhook <url> responded 401`, so an application found its Telegram token in
 * its logs on every alert that failed.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const TELEGRAM_TOKEN = '7123456789:AAH-secret-token-value';
const TELEGRAM = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=42`;
const SLACK = 'https://hooks.slack.com/services/T000/B000/slack-secret-path';
const DISCORD = 'https://discord.com/api/webhooks/123/discord-secret-token';

const exception = { id: 1, type: 'exception', payload: { name: 'Error', message: 'boom' } };

const original = global.fetch;
afterEach(() => {
  global.fetch = original;
  vi.restoreAllMocks();
});

/** Sends one exception to `urls` with `fetchImpl`, and returns what was warned. */
const warnings = async (urls: string[], fetchImpl: typeof fetch): Promise<string[]> => {
  const warned: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warned.push(String(message));
  });
  global.fetch = fetchImpl;

  const stream = new Subject<Entry>();
  const service = new AlertingService(
    { entryStream$: stream.asObservable() } as unknown as CollectorService,
    {
      alerting: { enabled: true, webhooks: urls.map((url) => ({ url, throttleMs: 0 })) },
    } as unknown as NestLensConfig,
  );

  service.onModuleInit();
  stream.next(exception as unknown as Entry);
  await new Promise((resolve) => setTimeout(resolve, 20));
  service.onModuleDestroy();

  return warned;
};

describe('alerting never logs a webhook URL', () => {
  it('names a webhook that answered with an error by position and host', async () => {
    // Act
    const warned = await warnings(
      [SLACK, TELEGRAM],
      (async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch,
    );

    // Assert
    expect(warned.sort()).toEqual([
      'webhook #1 (hooks.slack.com) responded 401',
      'webhook #2 (api.telegram.org) responded 401',
    ]);
  });

  it('keeps the URL out of a delivery error that quotes it', async () => {
    // Arrange: undici's own messages quote the URL, e.g. a parse failure.
    const fetchImpl = (async (url: string) => {
      throw new TypeError(`Failed to parse URL from ${url}`);
    }) as unknown as typeof fetch;

    // Act
    const warned = await warnings([TELEGRAM, DISCORD], fetchImpl);

    // Assert
    expect(warned.sort()).toEqual([
      'webhook #1 (api.telegram.org) delivery error: TypeError: Failed to parse URL from webhook #1 (api.telegram.org)',
      'webhook #2 (discord.com) delivery error: TypeError: Failed to parse URL from webhook #2 (discord.com)',
    ]);
  });

  it.each([TELEGRAM_TOKEN, 'slack-secret-path', 'discord-secret-token', 'chat_id'])(
    'writes no part of a secret path or query (%s) to any log line',
    async (secret) => {
      // Act
      const failed = await warnings(
        [TELEGRAM, SLACK, DISCORD],
        (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch,
      );
      const errored = await warnings([TELEGRAM, SLACK, DISCORD], (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as unknown as typeof fetch);

      // Assert
      expect([...failed, ...errored].join('\n')).not.toContain(secret);
      expect(failed).toHaveLength(3);
      expect(errored).toHaveLength(3);
    },
  );
});
