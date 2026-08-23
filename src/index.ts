// Main module
export type { NestLensPreset } from './presets';

export { NestLensModule } from './nestlens.module';

// Config
export {
  // Main config
  NestLensConfig,
  // Authorization
  AuthorizationConfig,
  AuthUser,
  RateLimitConfig,
  // Dashboard on a listener of its own
  DashboardServerConfig,
  // Recording a fraction of traffic
  SamplingConfig,
  // Watcher configs
  RequestWatcherConfig,
  QueryWatcherConfig,
  ExceptionWatcherConfig,
  LogWatcherConfig,
  CacheWatcherConfig,
  EventWatcherConfig,
  JobWatcherConfig,
  ScheduleWatcherConfig,
  MailWatcherConfig,
  HttpClientWatcherConfig,
  RedisWatcherConfig,
  ModelWatcherConfig,
  NotificationWatcherConfig,
  ViewWatcherConfig,
  CommandWatcherConfig,
  GateWatcherConfig,
  BatchWatcherConfig,
  DumpWatcherConfig,
  GraphQLWatcherConfig,
  GraphQLSubscriptionConfig,
  GraphQLOperationContext,
  // Security and masking
  SecurityConfig,
  // Alerting
  AlertingConfig,
  AlertingWebhook,
  AlertingEvents,
  AlertingWebhookType,
  // Storage config
  StorageConfig,
  StorageDriver,
  SqliteStorageConfig,
  RedisStorageConfig,
  MemoryStorageConfig,
  // Pruning
  PruningConfig,
  // Constants
  NESTLENS_CONFIG,
  NESTLENS_API_PREFIX,
} from './nestlens.config';

// Types
export * from './types';

// Core services (for advanced usage)
export { MaskingTerms } from './core/masking-terms';
export { CollectorService } from './core/collector.service';
export { StorageInterface, STORAGE } from './core/storage/storage.interface';
export { createStorage } from './core/storage/storage.factory';
export { MemoryStorage } from './core/storage/memory.storage';
export { TagService } from './core/tag.service';

// Logger (for replacing NestJS default logger)
export { NestLensLogger } from './watchers/log.watcher';

// Request ID header constant
export { REQUEST_ID_HEADER } from './watchers/request.watcher';

// Watcher classes.
//
// Every one of them, because every one is an `@Injectable()` an application
// may hold: several carry a manual `track*` method as their documented way in,
// and three of those — `BatchWatcher`, `DumpWatcher` and `GateWatcher` — were
// written up with `import { … } from 'nestlens'` while not being exported at
// all. Following the documentation produced `undefined`. `exports` in
// package.json allows three entry points, so what is not here is not reachable
// by any other route either.
export { BatchWatcher } from './watchers/batch.watcher';
export { CacheWatcher } from './watchers/cache.watcher';
export { CommandWatcher } from './watchers/command.watcher';
export { DumpWatcher } from './watchers/dump.watcher';
export { EventWatcher } from './watchers/event.watcher';
export { ExceptionWatcher } from './watchers/exception.watcher';
export { GateWatcher } from './watchers/gate.watcher';
export { HttpClientWatcher } from './watchers/http-client.watcher';
export { JobWatcher } from './watchers/job.watcher';
export { MailWatcher } from './watchers/mail.watcher';
export { ModelWatcher } from './watchers/model.watcher';
export { NotificationWatcher } from './watchers/notification.watcher';
export { RedisWatcher } from './watchers/redis.watcher';
export { RequestWatcher } from './watchers/request.watcher';
export { ScheduleWatcher } from './watchers/schedule.watcher';
export { ViewWatcher } from './watchers/view.watcher';
export { GraphQLWatcher, GRAPHQL_WATCHER } from './watchers/graphql';

// Watcher tokens (for dependency injection)
export { NESTLENS_EVENT_EMITTER } from './watchers/event.watcher';
export { NESTLENS_REDIS_CLIENT } from './watchers/redis.watcher';
export { NESTLENS_MODEL_SUBSCRIBER } from './watchers/model.watcher';
export { NESTLENS_NOTIFICATION_SERVICE } from './watchers/notification.watcher';
export { NESTLENS_VIEW_ENGINE } from './watchers/view.watcher';
export { NESTLENS_HTTP_CLIENT } from './watchers/http-client.watcher';
export { NESTLENS_MAILER_SERVICE } from './watchers/mail.watcher';
export { NESTLENS_GATE_SERVICE } from './watchers/gate.watcher';
export { NESTLENS_COMMAND_BUS } from './watchers/command.watcher';
export { NESTLENS_BATCH_PROCESSOR } from './watchers/batch.watcher';
export { NESTLENS_DUMP_SERVICE } from './watchers/dump.watcher';
