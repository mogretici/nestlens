import { format, formatDistanceToNow } from 'date-fns';
import DOMPurify from 'dompurify';
import { Mail, Clock, CheckCircle, XCircle, AlertCircle, Users, Download } from 'lucide-react';
import { MailEntry } from '../types';
import { BadgeList } from './ClickableBadge';
import { parseDate } from '../utils/date';
import { downloadAsEml } from '../utils/mail';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import CopyButton from './CopyButton';

interface MailDetailViewProps {
  entry: MailEntry;
}

const statusConfig = {
  sent: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30', label: 'SENT' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'FAILED' },
};

function formatRecipients(recipients: string | string[]): string[] {
  return Array.isArray(recipients) ? recipients : [recipients];
}

const mailStatuses = ['sent', 'failed'];

export default function MailDetailView({ entry }: MailDetailViewProps) {
  const { payload, createdAt, tags } = entry;

  // Filter out status tags from display
  const filteredTags = (tags || []).filter(tag => !mailStatuses.includes(tag.toLowerCase()));

  const config = statusConfig[payload.status] || statusConfig.sent;
  const StatusIcon = config.icon;

  const toRecipients = formatRecipients(payload.to);
  const ccRecipients = payload.cc ? formatRecipients(payload.cc) : [];
  const bccRecipients = payload.bcc ? formatRecipients(payload.bcc) : [];

  // Build tabs
  const tabs = [];

  if (payload.html) {
    tabs.push({
      id: 'html',
      label: 'HTML Preview',
      content: (
        <div className="p-4">
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-h-[500px] overflow-auto"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(payload.html) }}
          />
        </div>
      ),
    });
  }

  if (payload.text) {
    tabs.push({
      id: 'text',
      label: 'Plain Text',
      content: (
        <div className="p-4">
          <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono max-h-[500px] overflow-auto">
            {payload.text}
          </pre>
        </div>
      ),
    });
  }

  // If no HTML, default to text tab
  const defaultTab = payload.html ? 'html' : 'text';

  return (
    <div className="space-y-6">
      {/* Mail Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${config.bg} rounded-lg`}>
                <Mail className={`h-5 w-5 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {payload.subject}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mail Details
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <CopyButton text={payload.subject} label="Copy subject" />
              <button
                onClick={() => downloadAsEml(payload, createdAt)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Download as .eml file"
              >
                <Download className="h-4 w-4" />
              </button>
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
            <p className={`text-lg font-bold ${payload.status === 'sent' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {config.label}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span>
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Recipients</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {toRecipients.length + ccRecipients.length + bccRecipients.length}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Mail className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Content</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.html ? 'HTML' : ''}{payload.html && payload.text ? ' + ' : ''}{payload.text ? 'Text' : ''}
              {!payload.html && !payload.text && '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Mail Details Card */}
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
              label="Subject"
              value={
                <span className="font-medium text-gray-900 dark:text-white">
                  {payload.subject}
                </span>
              }
            />
            {payload.from && (
              <DetailRow
                label="From"
                value={
                  <div className="flex items-center space-x-2">
                    <code className="text-sm font-mono text-gray-900 dark:text-white">
                      {payload.from}
                    </code>
                    <CopyButton text={payload.from} />
                  </div>
                }
              />
            )}
            <DetailRow
              label="To"
              value={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {toRecipients.map((email, i) => (
                    <div key={i} className="flex items-center space-x-1">
                      <code className="text-sm font-mono text-gray-900 dark:text-white">
                        {email}
                      </code>
                      <CopyButton text={email} />
                    </div>
                  ))}
                </div>
              }
            />
            {ccRecipients.length > 0 && (
              <DetailRow
                label="CC"
                value={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {ccRecipients.map((email, i) => (
                      <div key={i} className="flex items-center space-x-1">
                        <code className="text-sm font-mono text-gray-900 dark:text-white">
                          {email}
                        </code>
                        <CopyButton text={email} />
                      </div>
                    ))}
                  </div>
                }
              />
            )}
            {bccRecipients.length > 0 && (
              <DetailRow
                label="BCC"
                value={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {bccRecipients.map((email, i) => (
                      <div key={i} className="flex items-center space-x-1">
                        <code className="text-sm font-mono text-gray-900 dark:text-white">
                          {email}
                        </code>
                        <CopyButton text={email} />
                      </div>
                    ))}
                  </div>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="mail" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {filteredTags.length > 0 && (
              <DetailRow
                label="Tags"
                value={
                  <BadgeList items={filteredTags} listType="mail" />
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
              <AlertCircle className="h-5 w-5 text-red-500" />
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

      {/* Content Tabs */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab={defaultTab}
          hashKey="mail"
        />
      )}
    </div>
  );
}
