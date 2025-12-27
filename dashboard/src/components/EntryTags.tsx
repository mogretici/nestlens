import { useState } from 'react';
import { addTagsToEntry, removeTagsFromEntry } from '../api';
import { getBadgeColor } from './ClickableBadge';

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
      console.error('Failed to add tag:', error);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      const result = await removeTagsFromEntry(entryId, [tag]);
      setLocalTags(result.data);
      onTagsChange?.(result.data);
    } catch (error) {
      console.error('Failed to remove tag:', error);
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
                className="px-2 py-0.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 w-24"
                autoFocus
              />
              <button
                onClick={handleAddTag}
                className="text-green-600 hover:text-green-700 text-xs"
              >
                +
              </button>
              <button
                onClick={() => setIsAdding(false)}
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

interface TagListProps {
  tags?: string[];
  maxTags?: number;
  onTagClick?: (tag: string) => void;
  clickable?: boolean;
}

/**
 * Simple inline tag list (non-editable, for table rows)
 */
export function TagList({ tags, maxTags = 3, onTagClick, clickable = false }: TagListProps) {
  if (!tags || tags.length === 0) return null;

  const displayTags = tags.slice(0, maxTags);
  const remaining = tags.length - maxTags;

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    if (onTagClick) {
      e.preventDefault();
      e.stopPropagation();
      onTagClick(tag);
    }
  };

  const isClickable = clickable || !!onTagClick;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayTags.map((tag) => (
        <button
          key={tag}
          onClick={isClickable ? (e) => handleTagClick(e, tag) : undefined}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          aria-label={isClickable ? `Click to filter by ${tag.toUpperCase()}` : undefined}
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide shadow ${getBadgeColor(tag)} ${
            isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : ''
          }`}
        >
          {tag.toUpperCase()}
        </button>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          +{remaining}
        </span>
      )}
    </div>
  );
}
