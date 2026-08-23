import { Entry, EntryType } from './types';
import { NestLensConfig } from './nestlens.config';

/**
 * A configuration written out for a job people keep having to write themselves.
 *
 * Recording only what failed, in production, takes five settings that are only
 * correct together — and one of them, the order in which sampling and the
 * filter run, is stated nowhere but in the collector's source. An application
 * reported reaching it at a hundred lines of configuration, arrived at by
 * reading `collector.service.ts`:
 *
 *   sampling.rate      0, so nothing ordinary is kept
 *   sampling.always    the types that are still kept — and `filter` never sees
 *                      what this drops, which is the part nobody guesses
 *   filter             narrows those types down to their failures
 *   captureResponse    off, because a payload is built before sampling is asked
 *   traceFieldResolvers off, for the same reason
 *
 * That is knowledge the library has and the reader should not need to
 * rediscover. `preset` puts it in the package.
 */
export type NestLensPreset = 'failures-only';

/** Types kept whatever the rate says, under `failures-only`. */
const FAILURE_TYPES: EntryType[] = ['exception', 'graphql', 'request', 'job', 'schedule'];

/**
 * Whether an entry is a failure, for the preset's own filter.
 *
 * Exceptions are failures by definition. The rest are kept only when they went
 * wrong — and a 4xx is deliberately not among them: a malformed query or a bad
 * request is the caller's mistake, and since the same entries drive an alerting
 * webhook, keeping them lets anyone with curl page whoever is on call.
 */
const isFailure = (entry: Entry): boolean => {
  switch (entry.type) {
    case 'exception':
      return true;
    case 'graphql':
      return entry.payload.hasErrors === true && (entry.payload.statusCode ?? 500) >= 500;
    case 'request':
      return (entry.payload.statusCode ?? 0) >= 500;
    case 'job':
    case 'schedule':
      return entry.payload.status === 'failed';
    default:
      return true;
  }
};

/**
 * The preset's own settings, which anything the application writes overrides.
 *
 * Written as a partial configuration rather than applied by hand so the
 * precedence is the ordinary one: preset first, application second.
 */
const FAILURES_ONLY: NestLensConfig = {
  sampling: { rate: 0, always: FAILURE_TYPES },
  filter: isFailure,
  watchers: {
    graphql: { enabled: true, captureResponse: false, traceFieldResolvers: false },
  },
};

const PRESETS: Record<NestLensPreset, NestLensConfig> = {
  'failures-only': FAILURES_ONLY,
};

/**
 * A preset's settings, with the application's own on top.
 *
 * `filter` is the one that composes rather than replaces: an application that
 * writes its own filter under `failures-only` means "the failures, and this
 * too" — replacing the preset's would quietly record everything again.
 */
export const applyPreset = (config: NestLensConfig): NestLensConfig => {
  if (!config.preset) return config;

  const preset = PRESETS[config.preset];
  const own = config.filter;

  return {
    ...preset,
    ...config,
    sampling: { ...preset.sampling, ...config.sampling },
    filter: own ? (entry: Entry) => isFailure(entry) && own(entry) !== false : preset.filter,
    watchers: {
      ...preset.watchers,
      ...config.watchers,
      graphql: mergeGraphQL(preset.watchers?.graphql, config.watchers?.graphql),
    },
  };
};

/**
 * The preset's GraphQL settings under whatever the application asked for.
 *
 * `watchers.graphql` is a boolean as often as an object, and `false` has to
 * keep meaning off: a preset does not get to turn a watcher on that somebody
 * turned off.
 */
type GraphQLSetting = NonNullable<NestLensConfig['watchers']>['graphql'];

const mergeGraphQL = (fromPreset: GraphQLSetting, fromConfig: GraphQLSetting): GraphQLSetting => {
  if (fromConfig === false) return false;
  if (fromConfig === undefined || fromConfig === true) return fromPreset;
  if (typeof fromPreset === 'object') return { ...fromPreset, ...fromConfig };

  return fromConfig;
};
