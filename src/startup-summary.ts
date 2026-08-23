import { NestLensConfig } from './nestlens.config';
import { toBaseHref } from './api/route-path';

/**
 * What NestLens is actually doing, in one line, at startup.
 *
 * It used to say `NestLens initialized`, which is true and says nothing. An
 * application reported four configuration mistakes found by reading Redis and
 * the library's source — writing to database 0, recording health checks and
 * nothing else, a webhook that could not fire — and three of the four are
 * visible in this line the moment the process starts.
 *
 * Read from the resolved configuration, so what it prints is what is in effect
 * rather than what was written: a preset's settings, a value that was clamped,
 * a dashboard that is not where somebody thought.
 */
export const startupSummary = (config: NestLensConfig): string => {
  const parts = [
    recording(config),
    storage(config),
    pruning(config),
    alerting(config),
    where(config),
  ];

  return parts.filter(Boolean).join(' · ');
};

const recording = (config: NestLensConfig): string => {
  const sampling = config.sampling;

  if (sampling?.rate === undefined || sampling.rate >= 1) {
    return 'recording everything';
  }

  const always = sampling.always ?? ['exception'];
  const kept = always.length > 0 ? `, always: ${always.join('+')}` : ', nothing exempt';

  return sampling.rate === 0
    ? `recording only what \`always\` names (${always.join('+') || 'nothing'})`
    : `sampling ${Math.round(sampling.rate * 100)}% of requests${kept}`;
};

const storage = (config: NestLensConfig): string => {
  const driver = config.storage?.driver ?? 'memory';

  if (driver === 'redis') {
    const redis = config.storage?.redis;
    const database = redis?.db ?? databaseInUrl(redis?.url) ?? 0;

    return `redis storage on db ${database}`;
  }

  if (driver === 'sqlite') {
    return `sqlite storage at ${config.storage?.sqlite?.filename ?? '.cache/nestlens.db'}`;
  }

  return 'in-memory storage';
};

/** The database an URL names, when it names one. */
const databaseInUrl = (url: string | undefined): number | undefined => {
  if (!url) return undefined;

  try {
    const path = new URL(url).pathname.replace(/^\//, '');

    return path.length > 0 && !Number.isNaN(Number(path)) ? Number(path) : undefined;
  } catch {
    return undefined;
  }
};

const pruning = (config: NestLensConfig): string => {
  if (config.pruning?.enabled === false) return 'pruning off';

  const hours = config.pruning?.maxAge ?? 24;
  const ceiling = config.storage?.maxEntries ?? config.storage?.memory?.maxEntries ?? 10_000;

  const every = config.pruning?.interval ?? 60;

  return (
    `keeping ${hours}h${ceiling > 0 ? ` or ${ceiling.toLocaleString('en-US')} entries` : ''}` +
    `, pruning every ${every}m`
  );
};

const alerting = (config: NestLensConfig): string => {
  if (!config.alerting?.enabled) return '';

  const webhooks = config.alerting.webhooks?.length ?? 0;

  return `${webhooks} alerting webhook${webhooks === 1 ? '' : 's'}`;
};

const where = (config: NestLensConfig): string => {
  const path = toBaseHref(config.path) || '/';

  return config.server
    ? `dashboard on ${config.server.host}:${config.server.port}${path}, not mounted on the application`
    : `dashboard mounted at ${path}`;
};
