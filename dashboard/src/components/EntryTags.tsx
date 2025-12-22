import { useState } from 'react';
import { addTagsToEntry, removeTagsFromEntry } from '../api';

interface EntryTagsProps {
  entryId: number;
  tags: string[];
  onTagsChange?: (tags: string[]) => void;
  editable?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Get tag color based on tag name
 * Colors match the method column colors in RequestsPage
 */
export function getTagColor(tag: string): string {
  const t = tag.toUpperCase();

  // HTTP Methods - match RequestsPage method colors
  if (t === 'GET') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'POST') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'PUT') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (t === 'PATCH') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  }
  if (t === 'DELETE') {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
  if (['HEAD', 'OPTIONS'].includes(t)) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'GRAPHQL') {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }
  // 3xx Redirect
  if (t === 'REDIRECT' || t === '3XX') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }

  // Error related
  if (t === 'ERROR' || t === '5XX' || t === 'HTTP-ERROR' || t === 'VALIDATION-ERROR' || t === 'FAILED') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  // Warning related
  if (t === 'WARNING' || t === 'WARN' || t === '4XX' || t === 'CLIENT-ERROR') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  // Success related
  if (t === 'SUCCESS' || t === 'HIT') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  // Slow related
  if (t === 'SLOW') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }
  // User related
  if (t.startsWith('USER:')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }
  // Query types
  if (['SELECT', 'INSERT', 'UPDATE'].includes(t)) {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
  }
  // Cache miss
  if (t === 'MISS') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  // Default
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
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
          className={`inline-flex items-center rounded font-bold uppercase tracking-wide shadow ${sizeClasses} ${getTagColor(tag)}`}
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

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayTags.map((tag) => (
        <span
          key={tag}
          onClick={clickable || onTagClick ? (e) => handleTagClick(e, tag) : undefined}
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide shadow ${getTagColor(tag)} ${
            clickable || onTagClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''
          }`}
        >
          {tag.toUpperCase()}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          +{remaining}
        </span>
      )}
    </div>
  );
}
