// Main module
export { NestLensModule } from './nestlens.module';

// Config
export {
  // Main config
  NestLensConfig,
  // Authorization
  AuthorizationConfig,
  AuthUser,
  RateLimitConfig,
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
  // Storage & Pruning
  StorageConfig,
  PruningConfig,
  // Constants
  NESTLENS_CONFIG,
  NESTLENS_API_PREFIX,
} from './nestlens.config';

// Types
export * from './types';

// Core services (for advanced usage)
export { CollectorService } from './core/collector.service';
export { StorageInterface, STORAGE } from './core/storage/storage.interface';
export { TagService } from './core/tag.service';

// Logger (for replacing NestJS default logger)
export { NestLensLogger } from './watchers/log.watcher';

// Request ID header constant
export { REQUEST_ID_HEADER } from './watchers/request.watcher';

// Watcher classes (for manual setup)
export { JobWatcher } from './watchers/job.watcher';
export { ModelWatcher } from './watchers/model.watcher';

// Watcher tokens (for dependency injection)
export { NESTLENS_EVENT_EMITTER } from './watchers/event.watcher';
export { NESTLENS_BULL_QUEUES } from './watchers/job.watcher';
export { NESTLENS_REDIS_CLIENT } from './watchers/redis.watcher';
export { NESTLENS_MODEL_SUBSCRIBER } from './watchers/model.watcher';
export { NESTLENS_NOTIFICATION_SERVICE } from './watchers/notification.watcher';
export { NESTLENS_VIEW_ENGINE } from './watchers/view.watcher';
export { NESTLENS_HTTP_CLIENT } from './watchers/http-client.watcher';
export { NESTLENS_MAILER_SERVICE } from './watchers/mail.watcher';
export { NESTLENS_GATE_SERVICE } from './watchers/gate.watcher';
export { NESTLENS_COMMAND_BUS } from './watchers/command.watcher';
export { NESTLENS_BATCH_PROCESSOR } from './watchers/batch.watcher';
