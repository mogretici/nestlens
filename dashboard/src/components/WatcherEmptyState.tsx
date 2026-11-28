import { ExternalLink, Hand, PowerOff, Unplug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WatcherState } from '../types';
import { UnrecordingStatus } from '../contexts/useWatcherStatus';

interface Copy {
  title: string;
  link: string;
  icon: LucideIcon;
  iconClass: string;
  ringClass: string;
}

/**
 * What an empty table says when its watcher cannot record.
 *
 * "No Redis commands recorded yet" over a watcher that has no Redis client
 * reads as an idle application. A production application read it that way for
 * months. `recording` is absent on purpose: there the table's own message is
 * the truth.
 */
const COPY: Record<Exclude<WatcherState, 'recording'>, Copy> = {
  waiting: {
    title: 'This watcher is on, and has nothing to record',
    link: 'How to fix this',
    icon: Unplug,
    iconClass: 'text-amber-500 dark:text-amber-400',
    ringClass: 'bg-amber-50 dark:bg-amber-900/20',
  },
  off: {
    title: 'This watcher is switched off',
    link: 'How to switch it on',
    icon: PowerOff,
    iconClass: 'text-gray-400 dark:text-gray-500',
    ringClass: 'bg-gray-100 dark:bg-gray-800',
  },
  manual: {
    title: 'This watcher records what your code hands it',
    link: 'How to use it',
    icon: Hand,
    iconClass: 'text-gray-400 dark:text-gray-500',
    ringClass: 'bg-gray-100 dark:bg-gray-800',
  },
};

export default function WatcherEmptyState({ status }: { status: UnrecordingStatus }) {
  const copy = COPY[status.state];
  const Icon = copy.icon;

  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4"
      role="status"
      data-testid="watcher-empty-state"
      data-state={status.state}
    >
      <div className={`p-3 rounded-full mb-4 ${copy.ringClass}`}>
        <Icon className={`h-8 w-8 ${copy.iconClass}`} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white text-center">{copy.title}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
        {status.reason}
      </p>
      <a
        href={status.docs}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {copy.link}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <code className="mt-3 text-xs text-gray-400 dark:text-gray-500">{status.option}</code>
    </div>
  );
}
