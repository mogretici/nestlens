import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { clearEntries } from '../api';
import { EntryType } from '../types';

interface ClearTypeButtonProps {
  /** The kind of entry this page lists. */
  type: EntryType;
  /** What to call it in the confirmation, e.g. "queries". */
  label: string;
  /** Called after entries were deleted, so the list can catch up. */
  onCleared: () => void;
}

/**
 * Deletes what this page lists, and nothing else.
 *
 * Pruning deletes by age and *Clear all entries* deletes everything; there was
 * no way to say "these, now" — although every storage has had `pruneByType`
 * since the beginning and nothing ever called it.
 *
 * Two presses, because it cannot be undone: the first arms it and says how it
 * reads, the second does it. A confirm dialog would be the other way, and a
 * modal in a debugging tool is one more thing between a reader and their data.
 */
export default function ClearTypeButton({ type, label, onCleared }: ClearTypeButtonProps) {
  const [armed, setArmed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clear = useCallback(async () => {
    if (!armed) {
      setArmed(true);
      // Disarms itself, so a button left armed on a page nobody is looking at
      // cannot be pressed by accident later.
      setTimeout(() => setArmed(false), 5000);
      return;
    }

    setArmed(false);
    setClearing(true);
    try {
      const { message } = await clearEntries(type);
      // What the server said it did, not what this hoped.
      toast.success(message);
      onCleared();
    } catch (error) {
      toast.error(
        `Could not clear ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setClearing(false);
    }
  }, [armed, type, label, onCleared]);

  return (
    <button
      onClick={clear}
      disabled={clearing}
      aria-label={armed ? `Confirm deleting all ${label}` : `Delete all ${label}`}
      title={armed ? `Press again to delete all ${label}` : `Delete all ${label}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        armed
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400'
      }`}
    >
      <Trash2 className="h-4 w-4" />
      <span>{armed ? `Delete all ${label}?` : 'Clear'}</span>
    </button>
  );
}
