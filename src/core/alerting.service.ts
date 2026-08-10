import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Subscription } from 'rxjs';
import {
  AlertingConfig,
  AlertingWebhook,
  NestLensConfig,
  NESTLENS_CONFIG,
} from '../nestlens.config';
import { Entry, EntryType } from '../types';
import { CollectorService } from './collector.service';

const DEFAULT_EVENTS: EntryType[] = ['exception'];
const DEFAULT_THROTTLE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;

/** Concise, safe summary of an entry used to build webhook payloads. */
interface AlertSummary {
  type: EntryType;
  title: string;
  description: string;
  id?: number;
  requestId?: string;
}

/**
 * Sends collected entries (exceptions by default) to Slack/Discord/generic
 * webhooks in real time. Subscribes to the collector's entry stream, so it
 * never blocks request handling; every delivery is fire-and-forget with a
 * timeout, per-destination throttling and full error isolation.
 */
@Injectable()
export class AlertingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertingService.name);
  private readonly config?: AlertingConfig;
  private subscription?: Subscription;
  /** dedup key -> last sent timestamp (ms). */
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    nestlensConfig: NestLensConfig,
    @Optional()
    @Inject('ALERTING_NOW')
    private readonly now: () => number = () => Date.now(),
  ) {
    this.config = nestlensConfig.alerting;
  }

  onModuleInit(): void {
    const webhooks = this.config?.webhooks ?? [];
    if (!this.config?.enabled || webhooks.length === 0) {
      return;
    }

    this.subscription = this.collector.entryStream$.subscribe((entry) => {
      // Isolated: an alerting failure must never disrupt collection.
      void this.dispatch(entry).catch((error) => {
        this.logger.warn(`Alert dispatch failed: ${String(error)}`);
      });
    });

    this.logger.log(`Alerting enabled for ${webhooks.length} webhook(s)`);
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private async dispatch(entry: Entry): Promise<void> {
    const webhooks = this.config?.webhooks ?? [];
    await Promise.all(
      webhooks
        .filter((webhook) => (webhook.events ?? DEFAULT_EVENTS).includes(entry.type))
        .filter((webhook) => !this.isThrottled(webhook, entry))
        .map((webhook) => this.send(webhook, entry)),
    );
  }

  private isThrottled(webhook: AlertingWebhook, entry: Entry): boolean {
    const throttleMs = webhook.throttleMs ?? DEFAULT_THROTTLE_MS;
    if (throttleMs <= 0) return false;

    const key = `${webhook.url}::${this.dedupKey(entry)}`;
    const now = this.now();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < throttleMs) {
      return true;
    }
    this.lastSent.set(key, now);
    return false;
  }

  private dedupKey(entry: Entry): string {
    if (entry.type === 'exception') {
      const payload = entry.payload as { name?: string; message?: string };
      return `exception:${payload.name ?? ''}:${payload.message ?? ''}`;
    }
    return `${entry.type}:${entry.id ?? ''}`;
  }

  private async send(webhook: AlertingWebhook, entry: Entry): Promise<void> {
    const summary = this.summarize(entry);
    const body = this.formatPayload(webhook.type ?? 'generic', summary, entry);
    const timeoutMs = this.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`Webhook ${webhook.url} responded ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Webhook ${webhook.url} delivery error: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private summarize(entry: Entry): AlertSummary {
    if (entry.type === 'exception') {
      const payload = entry.payload as {
        name?: string;
        message?: string;
        request?: { method?: string; url?: string };
      };
      const route = payload.request?.url
        ? ` (${payload.request.method ?? 'GET'} ${payload.request.url})`
        : '';
      return {
        type: entry.type,
        title: payload.name ?? 'Exception',
        description: `${payload.message ?? ''}${route}`.trim(),
        id: entry.id,
        requestId: entry.requestId,
      };
    }

    return {
      type: entry.type,
      title: `New ${entry.type} entry`,
      description: '',
      id: entry.id,
      requestId: entry.requestId,
    };
  }

  private formatPayload(
    type: NonNullable<AlertingWebhook['type']>,
    summary: AlertSummary,
    entry: Entry,
  ): object {
    const text = `🔭 *NestLens* — ${summary.title}${
      summary.description ? `\n${summary.description}` : ''
    }`;

    switch (type) {
      case 'slack':
        return { text };
      case 'discord':
        return { content: text };
      case 'generic':
      default:
        return {
          event: entry.type,
          entry: {
            id: entry.id,
            type: entry.type,
            requestId: entry.requestId,
            title: summary.title,
            description: summary.description,
          },
        };
    }
  }
}
