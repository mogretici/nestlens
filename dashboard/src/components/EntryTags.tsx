import { useState } from 'react';
import toast from 'react-hot-toast';
import { addTagsToEntry, removeTagsFromEntry } from '../api';
import { getBadgeColor } from './badgeColors';

interface EntryTagsProps {
  entryId: number;
  tags: string[];
  onTagsChange?: (tags: string[]) => void;
  editable?: boolean;
  size?: 'sm' | 'md';
}

export function EntryTags({
  entryId,
  tags,
  onTagsChange,
  editable = false,
  size = 'sm',
}: EntryTagsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [localTags, setLocalTags] = useState(tags);

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-1 text-sm';

  const handleAddTag = async () => {
    if (!newTag.trim()) return;

    try {
      const result = await addTagsToEntry(entryId, [newTag.trim()]);
      setLocalTags(result.data);
      onTagsChange?.(result.data);
      setNewTag('');
      setIsAdding(false);
    } catch (error) {
      // The tag simply did not appear, and nothing said why: the API refusing
      // and the tag being saved looked the same to the reader.
      console.error('Failed to add tag:', error);
      toast.error(`Could not add the tag: ${(error as Error).message}`);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      const result = await removeTagsFromEntry(entryId, [tag]);
      setLocalTags(result.data);
      onTagsChange?.(result.data);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      toast.error(`Could not remove the tag: ${(error as Error).message}`);
    }
  };

  if (localTags.length === 0 && !editable) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {localTags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded font-bold uppercase tracking-wide shadow ${sizeClasses} ${getBadgeColor(tag)}`}
        >
          {tag.toUpperCase()}
          {editable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveTag(tag);
              }}
              aria-label={`Remove tag ${tag}`}
              className="ml-1 hover:text-red-600 dark:hover:text-red-400"
            >
              &times;
            </button>
          )}
        </span>
      ))}

      {editable && (
        <>
          {isAdding ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') setIsAdding(false);
                }}
                placeholder="New tag..."
                aria-label="New tag"
                className="px-2 py-0.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 w-24"
                autoFocus
              />
              <button
                onClick={handleAddTag}
                aria-label="Save tag"
                className="text-green-600 hover:text-green-700 text-xs"
              >
                +
              </button>
              <button
                onClick={() => setIsAdding(false)}
                aria-label="Cancel adding a tag"
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAdding(true);
              }}
              // The others in this component are labelled; this one read as
              // "+ Tag", where the plus is decoration and the noun is not a
              // verb.
              aria-label="Add a tag"
              className={`inline-flex items-center rounded-lg font-medium ${sizeClasses} bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600`}
            >
              + Tag
            </button>
          )}
        </>
      )}
    </div>
  );
}
