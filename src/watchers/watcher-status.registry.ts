import { WatcherStatusSources } from './watcher-status.service';
import { RequestWatcher } from './request.watcher';
import { QueryWatcher } from './query';
import { ExceptionWatcher } from './exception.watcher';
import { NestLensLogger } from './log.watcher';
import { CacheWatcher } from './cache.watcher';
import { EventWatcher } from './event.watcher';
import { JobWatcher } from './job.watcher';
import { ScheduleWatcher } from './schedule.watcher';
import { MailWatcher } from './mail.watcher';
import { HttpClientWatcher } from './http-client.watcher';
import { RedisWatcher } from './redis.watcher';
import { ModelWatcher } from './model.watcher';
import { NotificationWatcher } from './notification.watcher';
import { ViewWatcher } from './view.watcher';
import { CommandWatcher } from './command.watcher';
import { GateWatcher } from './gate.watcher';
import { BatchWatcher } from './batch.watcher';
import { DumpWatcher } from './dump.watcher';
import { GraphQLWatcher } from './graphql';

/**
 * Who reports the status of each entry type. A `Record` over `EntryType`, so a
 * new entry type does not compile until it has a reporter here, and
 * `watcher-status.spec.ts` asks every one of them at runtime.
 */
export const WATCHER_STATUS_REGISTRY: WatcherStatusSources = {
  request: { option: 'request', reporter: RequestWatcher, page: 'watchers/request' },
  query: { option: 'query', reporter: QueryWatcher, page: 'watchers/query' },
  exception: { option: 'exception', reporter: ExceptionWatcher, page: 'watchers/exception' },
  log: { option: 'log', reporter: NestLensLogger, page: 'watchers/log' },
  cache: { option: 'cache', reporter: CacheWatcher, page: 'watchers/cache' },
  event: { option: 'event', reporter: EventWatcher, page: 'watchers/event' },
  job: { option: 'job', reporter: JobWatcher, page: 'watchers/job' },
  schedule: { option: 'schedule', reporter: ScheduleWatcher, page: 'watchers/schedule' },
  mail: { option: 'mail', reporter: MailWatcher, page: 'watchers/mail' },
  'http-client': {
    option: 'httpClient',
    reporter: HttpClientWatcher,
    page: 'watchers/http-client',
  },
  redis: { option: 'redis', reporter: RedisWatcher, page: 'watchers/redis' },
  model: { option: 'model', reporter: ModelWatcher, page: 'watchers/model' },
  notification: {
    option: 'notification',
    reporter: NotificationWatcher,
    page: 'watchers/notification',
  },
  view: { option: 'view', reporter: ViewWatcher, page: 'watchers/view' },
  command: { option: 'command', reporter: CommandWatcher, page: 'watchers/command' },
  gate: { option: 'gate', reporter: GateWatcher, page: 'watchers/gate' },
  batch: { option: 'batch', reporter: BatchWatcher, page: 'watchers/batch' },
  dump: { option: 'dump', reporter: DumpWatcher, page: 'watchers/dump' },
  graphql: { option: 'graphql', reporter: GraphQLWatcher, page: 'watchers/graphql' },
};
