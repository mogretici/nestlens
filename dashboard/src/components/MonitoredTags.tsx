import { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { addMonitoredTag, getMonitoredTags, removeMonitoredTag } from '../api';
import { getBadgeColor } from './badgeColors';

interface Monitored {
  tag: string;
  count: number;
}

/**
 * The tags whose entries pruning leaves alone.
 *
 * Monitoring is stored in all three drivers and answered by the API, and
 * nothing showed it: a reader had no way to say which entries were worth
 * keeping, and no way to see what they had already said. Beside the retention
 * figures, because that is what it changes — an entry carrying one of these is
 * kept when pruning runs. The store's `maxEntries` ceiling still applies.
 */
export default function MonitoredTags() {
  const [tags, setTags] = useState<Monitored[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await getMonitoredTags();
      setTags(response.data.map(({ tag, count }) => ({ tag, count })));
      setError(null);
    } catch (caught) {
      // The list is a claim about what is protected; an empty one that could
      // not be fetched would read as "nothing is".
      setError(caught instanceof Error ? caught : new Error('Failed to load monitored tags'));
    }
  }, []);

  useEffect(() => {
    // Scheduled rather than called: a `setState` reached synchronously from an
    // effect makes React render again before the browser has painted, which is
    // what the rule beside this one is about.
    const timer = setTimeout(() => void load(), 0);

    return () => clearTimeout(timer);
  }, [load]);

  const add = async (): Promise<void> => {
    const tag = draft.trim();
    if (!tag) return;

    try {
      await addMonitoredTag(tag);
      setDraft('');
      setAdding(false);
      await load();
      toast.success(`Keeping entries tagged ${tag.toUpperCase()}`);
    } catch (caught) {
      toast.error(
        `Could not monitor that tag: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  };

  const remove = async (tag: string): Promise<void> => {
    try {
      await removeMonitoredTag(tag);
      await load();
    } catch (caught) {
      toast.error(
        `Could not stop monitoring: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  };

  return (
    <div className="pt-3 border-t border-gray-200 dark:border-gray-700" data-testid="monitored-tags">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <Eye className="h-4 w-4" />
          <span className="text-sm">Kept from pruning</span>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            aria-label="Monitor a tag"
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error.message}. This is not a list of nothing being kept.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {tags.length === 0 && !adding && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No tag is monitored: everything is pruned by age.
            </p>
          )}

          {tags.map(({ tag, count }) => (
            <span
              key={tag}
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide shadow ${getBadgeColor(tag)}`}
            >
              {tag}
              <span className="ml-1 font-normal opacity-80">{count}</span>
              <button
                onClick={() => void remove(tag)}
                aria-label={`Stop monitoring ${tag}`}
                className="ml-1 hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {adding && (
            <span className="inline-flex items-center gap-1">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void add();
                  if (event.key === 'Escape') setAdding(false);
                }}
                placeholder="Tag to keep..."
                aria-label="Tag to monitor"
                autoFocus
                className="px-2 py-0.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 w-28 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={() => void add()}
                aria-label="Save monitored tag"
                className="text-xs text-primary-600 dark:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              >
                ✓
              </button>
              <button
                onClick={() => setAdding(false)}
                aria-label="Cancel monitoring a tag"
                className="text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
