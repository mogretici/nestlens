import { format, formatDistanceToNow } from 'date-fns';
import { Clock, CheckCircle, XCircle, Play, Timer, Calendar } from 'lucide-react';
import cronstrue from 'cronstrue';
import { ScheduleEntry } from '../types';
import { BadgeList } from './ClickableBadge';
import { parseDate } from '../utils/date';
import { formatMsHuman } from '../utils/format';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';

// Convert cron expression to human-readable text
function formatCronHuman(cron: string): string | null {
  try {
    return cronstrue.toString(cron);
  } catch {
    return null;
  }
}

interface ScheduleDetailViewProps {
  entry: ScheduleEntry;
}

const statusConfig = {
  started: { icon: Play, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'STARTED' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30', label: 'COMPLETED' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'FAILED' },
};

const scheduleStatuses = ['started', 'completed', 'failed'];

export default function ScheduleDetailView({ entry }: ScheduleDetailViewProps) {
  const { payload, createdAt, tags } = entry;

  // Filter out status tags from display
  const filteredTags = (tags || []).filter(tag => !scheduleStatuses.includes(tag.toLowerCase()));

  const config = statusConfig[payload.status] || statusConfig.started;
  const StatusIcon = config.icon;

  // Format schedule (cron or interval)
  const formatSchedule = () => {
    if (payload.cron) return payload.cron;
    if (payload.interval) return `${payload.interval}ms`;
    return '-';
  };

  return (
    <div className="space-y-6">
      {/* Schedule Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${config.bg} rounded-lg`}>
                <Clock className={`h-5 w-5 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate font-mono">
                  {payload.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Scheduled Task
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <StatusIcon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Status</span>
            </div>
            <p className={`text-lg font-bold ${
              payload.status === 'completed' ? 'text-green-600 dark:text-green-400' :
              payload.status === 'failed' ? 'text-red-600 dark:text-red-400' :
              'text-blue-600 dark:text-blue-400'
            }`}>
              {config.label}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Timer className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration !== undefined ? (
                <>{payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span></>
              ) : '-'}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Schedule</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white font-mono">
              {formatSchedule()}
            </p>
            {payload.cron && formatCronHuman(payload.cron) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatCronHuman(payload.cron)}
              </p>
            )}
            {payload.interval && formatMsHuman(payload.interval) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatMsHuman(payload.interval)}
              </p>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Timeout</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.timeout !== undefined ? (
                <>{payload.timeout}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span></>
              ) : '-'}
            </p>
            {payload.timeout !== undefined && formatMsHuman(payload.timeout) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatMsHuman(payload.timeout)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Details
          </h2>
        </div>
        <div className="p-4">
          <dl className="divide-y-0">
            <DetailRow
              label="Time"
              value={
                <span>
                  {format(parseDate(createdAt), "MMMM do yyyy, h:mm:ss a")}{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    ({formatDistanceToNow(parseDate(createdAt), { addSuffix: true })})
                  </span>
                </span>
              }
            />
            <DetailRow
              label="Task Name"
              value={
                <ClickableBadge listType="schedule" filterType="names" filterValue={payload.name} className="font-mono">
                  {payload.name}
                </ClickableBadge>
              }
            />
            {payload.cron && (
              <DetailRow
                label="Cron Expression"
                value={
                  <div>
                    <code className="text-sm font-mono text-gray-900 dark:text-white">
                      {payload.cron}
                    </code>
                    {formatCronHuman(payload.cron) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatCronHuman(payload.cron)}
                      </p>
                    )}
                  </div>
                }
              />
            )}
            {payload.interval && (
              <DetailRow
                label="Interval"
                value={
                  <div>
                    <span>{payload.interval}ms</span>
                    {formatMsHuman(payload.interval) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatMsHuman(payload.interval)}
                      </p>
                    )}
                  </div>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="schedule" filterType="statuses" filterValue={payload.status}>
                  {payload.status}
                </ClickableBadge>
              }
            />
            {payload.duration !== undefined && (
              <DetailRow
                label="Duration"
                value={`${payload.duration}ms`}
              />
            )}
            {payload.timeout !== undefined && (
              <DetailRow
                label="Timeout"
                value={
                  <div>
                    <span>{payload.timeout}ms</span>
                    {formatMsHuman(payload.timeout) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatMsHuman(payload.timeout)}
                      </p>
                    )}
                  </div>
                }
              />
            )}
            {payload.nextRun && (
              <DetailRow
                label="Next Run"
                value={
                  <span>
                    {format(parseDate(payload.nextRun), "MMMM do yyyy, h:mm:ss a")}{' '}
                    <span className="text-gray-500 dark:text-gray-400">
                      ({formatDistanceToNow(parseDate(payload.nextRun), { addSuffix: true })})
                    </span>
                  </span>
                }
              />
            )}
            {filteredTags.length > 0 && (
              <DetailRow
                label="Tags"
                value={
                  <BadgeList items={filteredTags} listType="schedule" />
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Error Card (if failed) */}
      {payload.error && (
        <div className="card border-red-200 dark:border-red-800">
          <div className="px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                Error
              </h2>
            </div>
          </div>
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10">
            <pre className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap overflow-x-auto">
              {payload.error}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
