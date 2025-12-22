import { useState, useCallback, memo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Search, X, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { JsonValue } from '../types';

interface JsonViewerProps {
  data: JsonValue;
  title?: string;
  initialExpanded?: boolean;
  maxInitialDepth?: number;
  searchable?: boolean;
  maxHeight?: number | string;
  /** Render without card wrapper */
  inline?: boolean;
  /** Show toolbar (expand/collapse/search/copy) even in inline mode */
  showToolbar?: boolean;
  /** External search term - when provided, uses this instead of internal state */
  externalSearchTerm?: string;
}

interface JsonNodeProps {
  keyName: string | null;
  value: JsonValue;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  searchTerm: string;
  path: string;
  isArrayItem?: boolean;
}

type ValueType = 'null' | 'undefined' | 'boolean' | 'number' | 'string' | 'array' | 'object';

function getValueType(value: JsonValue): ValueType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value as ValueType;
}

function countItems(value: JsonValue, type: ValueType): number {
  if (type === 'array') return (value as JsonValue[]).length;
  if (type === 'object') return Object.keys(value as object).length;
  return 0;
}

function matchesSearch(value: JsonValue, searchTerm: string, key?: string): boolean {
  if (!searchTerm) return false;
  const lower = searchTerm.toLowerCase();

  if (key && key.toLowerCase().includes(lower)) return true;
  if (value === null) return 'null'.includes(lower);
  if (typeof value === 'string') return value.toLowerCase().includes(lower);
  if (typeof value === 'number') return String(value).includes(lower);
  if (typeof value === 'boolean') return String(value).includes(lower);
  return false;
}

function hasMatchingDescendant(value: JsonValue, searchTerm: string): boolean {
  if (!searchTerm) return false;
  const lower = searchTerm.toLowerCase();

  if (value === null) return 'null'.includes(lower);
  if (typeof value === 'string') return value.toLowerCase().includes(lower);
  if (typeof value === 'number') return String(value).includes(lower);
  if (typeof value === 'boolean') return String(value).includes(lower);
  if (Array.isArray(value)) {
    return value.some(v => hasMatchingDescendant(v, searchTerm));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([k, v]) => k.toLowerCase().includes(lower) || hasMatchingDescendant(v, searchTerm)
    );
  }
  return false;
}

const JsonNode = memo(function JsonNode({
  keyName,
  value,
  depth,
  expandedPaths,
  onToggle,
  searchTerm,
  path,
  isArrayItem = false,
}: JsonNodeProps) {
  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const isExpanded = expandedPaths.has(path);
  const itemCount = countItems(value, type);
  const isEmpty = itemCount === 0;

  const isKeyMatch = searchTerm && keyName && keyName.toLowerCase().includes(searchTerm.toLowerCase());
  const isValueMatch = matchesSearch(value, searchTerm);
  const hasMatch = isKeyMatch || isValueMatch;

  const handleToggle = useCallback(() => {
    onToggle(path);
  }, [onToggle, path]);

  const handleCopyValue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  }, [value]);

  const renderValue = () => {
    const highlight = isValueMatch ? 'bg-yellow-400/30 rounded px-0.5' : '';

    switch (type) {
      case 'null':
        return <span className={`text-orange-600 dark:text-orange-400 italic ${highlight}`}>null</span>;
      case 'undefined':
        return <span className={`text-gray-500 italic ${highlight}`}>undefined</span>;
      case 'boolean':
        return <span className={`text-purple-600 dark:text-purple-400 ${highlight}`}>{String(value)}</span>;
      case 'number':
        return <span className={`text-cyan-600 dark:text-cyan-400 ${highlight}`}>{String(value)}</span>;
      case 'string': {
        const strValue = value as string;
        const maxLen = 300;
        const isLong = strValue.length > maxLen;
        const displayValue = isLong ? strValue.slice(0, maxLen) : strValue;

        // Check if it looks like a URL
        const isUrl = /^https?:\/\//.test(strValue);
        // Check if it looks like a date
        const isDate = /^\d{4}-\d{2}-\d{2}/.test(strValue);
        // Check if it looks like an email
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue);

        return (
          <span className={`text-green-600 dark:text-green-400 ${highlight}`}>
            "{displayValue}
            {isLong && <span className="text-gray-500">... ({strValue.length - maxLen} more)</span>}
            "
            {isUrl && <span className="ml-1 text-blue-600 dark:text-blue-400 text-xs">(URL)</span>}
            {isDate && <span className="ml-1 text-amber-600 dark:text-yellow-400 text-xs">(Date)</span>}
            {isEmail && <span className="ml-1 text-pink-600 dark:text-pink-400 text-xs">(Email)</span>}
          </span>
        );
      }
      case 'array':
        if (!isExpanded) {
          return (
            <span className="text-gray-600 dark:text-gray-400">
              [{isEmpty ? '' : <span className="text-gray-500 text-xs ml-1">{itemCount} items</span>}]
            </span>
          );
        }
        return <span className="text-gray-600 dark:text-gray-400">[</span>;
      case 'object':
        if (!isExpanded) {
          return (
            <span className="text-gray-600 dark:text-gray-400">
              {'{'}
              {isEmpty ? '' : <span className="text-gray-500 text-xs ml-1">{itemCount} keys</span>}
              {'}'}
            </span>
          );
        }
        return <span className="text-gray-600 dark:text-gray-400">{'{'}</span>;
      default:
        return <span className="text-gray-700 dark:text-gray-300">{String(value)}</span>;
    }
  };

  const renderChildren = () => {
    if (!isExpandable || !isExpanded) return null;

    const entries = type === 'array'
      ? (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue])
      : Object.entries(value as object);

    return (
      <>
        {entries.map(([k, v]) => (
          <JsonNode
            key={`${path}.${k}`}
            keyName={k}
            value={v}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            onToggle={onToggle}
            searchTerm={searchTerm}
            path={`${path}.${k}`}
            isArrayItem={type === 'array'}
          />
        ))}
        <div className="flex items-start">
          {/* Empty space for copy button alignment */}
          <span className="w-6 flex-shrink-0" />
          <div style={{ paddingLeft: depth * 16 + 16 }} className="text-gray-600 dark:text-gray-400">
            {type === 'array' ? ']' : '}'}
          </div>
        </div>
      </>
    );
  };

  const indent = depth * 16;

  return (
    <>
      <div
        className={`group flex items-start py-[1px] hover:bg-gray-100 dark:hover:bg-white/5 rounded cursor-pointer transition-colors ${
          hasMatch ? 'bg-yellow-500/10' : ''
        }`}
        onClick={isExpandable ? handleToggle : undefined}
      >
        {/* Copy button - fixed at far left */}
        <span className="w-6 h-6 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopyValue}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Copy value"
          >
            <Copy className="w-4 h-4" />
          </button>
        </span>

        {/* Indented content */}
        <div className="flex items-start flex-1" style={{ paddingLeft: indent }}>
          {/* Expand/collapse icon */}
          <span className="w-4 h-5 flex items-center justify-center flex-shrink-0">
            {isExpandable && !isEmpty && (
              isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              )
            )}
          </span>

          {/* Key */}
          {keyName !== null && (
            <>
              <span className={`${isArrayItem ? 'text-gray-500' : 'text-blue-700 dark:text-blue-300'} ${isKeyMatch ? 'bg-yellow-400/30 rounded px-0.5' : ''}`}>
                {isArrayItem ? keyName : `"${keyName}"`}
              </span>
              <span className="text-gray-500 mx-1">:</span>
            </>
          )}

          {/* Value */}
          <span className="flex-1">{renderValue()}</span>
        </div>
      </div>

      {renderChildren()}
    </>
  );
});

export default function JsonViewer({
  data,
  title,
  initialExpanded = true,
  maxInitialDepth = 2,
  searchable = true,
  maxHeight = 500,
  inline = false,
  showToolbar = false,
  externalSearchTerm,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Use external search term if provided, otherwise use internal state
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = setInternalSearchTerm;
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Initialize with paths expanded up to maxInitialDepth
    const paths = new Set<string>();
    if (initialExpanded) {
      const addPaths = (value: JsonValue, path: string, depth: number) => {
        if (depth >= maxInitialDepth) return;
        paths.add(path);
        if (Array.isArray(value)) {
          value.forEach((v, i) => addPaths(v, `${path}.${i}`, depth + 1));
        } else if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([k, v]) => addPaths(v, `${path}.${k}`, depth + 1));
        }
      };
      addPaths(data, 'root', 0);
    }
    return paths;
  });

  // Auto-expand paths when searching
  useEffect(() => {
    if (searchTerm) {
      const pathsToExpand = new Set<string>(expandedPaths);
      const findPaths = (value: JsonValue, path: string) => {
        if (hasMatchingDescendant(value, searchTerm)) {
          pathsToExpand.add(path);
        }
        if (Array.isArray(value)) {
          value.forEach((v, i) => findPaths(v, `${path}.${i}`));
        } else if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([k, v]) => findPaths(v, `${path}.${k}`));
        }
      };
      findPaths(data, 'root');
      setExpandedPaths(pathsToExpand);
    }
  }, [searchTerm, data]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const paths = new Set<string>();
    const addAllPaths = (value: JsonValue, path: string) => {
      paths.add(path);
      if (Array.isArray(value)) {
        value.forEach((v, i) => addAllPaths(v, `${path}.${i}`));
      } else if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([k, v]) => addAllPaths(v, `${path}.${k}`));
      }
    };
    addAllPaths(data, 'root');
    setExpandedPaths(paths);
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      toast.success('JSON copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const toggleSearch = () => {
    setShowSearch(prev => !prev);
    if (showSearch) {
      setSearchTerm('');
    }
  };

  const jsonContent = (
    <div
      className={`p-3 overflow-auto font-mono text-sm ${inline ? '' : 'bg-white dark:bg-gray-800'}`}
      style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
    >
      <JsonNode
        keyName={null}
        value={data}
        depth={0}
        expandedPaths={expandedPaths}
        onToggle={handleToggle}
        searchTerm={searchTerm}
        path="root"
      />
    </div>
  );

  // Toolbar component for reuse
  const toolbar = (
    <div className="flex items-center justify-between mb-2">
      {title && (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      )}
      <div className={`flex items-center space-x-1 ${title ? '' : 'ml-auto'}`}>
        <button
          onClick={handleExpandAll}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Expand all"
        >
          <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
        </button>
        <button
          onClick={handleCollapseAll}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Collapse all"
        >
          <Minimize2 className="h-3.5 w-3.5 text-gray-500" />
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        {searchable && (
          <button
            onClick={toggleSearch}
            className={`p-1.5 rounded transition-colors ${
              showSearch
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'
            }`}
            title="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Copy JSON"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>
      </div>
    </div>
  );

  // Search bar component for reuse
  const searchBar = showSearch && (
    <div className="mb-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search keys and values..."
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (inline) {
    if (showToolbar) {
      return (
        <div>
          {toolbar}
          {searchBar}
          {jsonContent}
        </div>
      );
    }
    return jsonContent;
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center space-x-3">
          {title && (
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
          )}
          <span className="text-xs text-gray-500">
            {Array.isArray(data) ? `${data.length} items` : typeof data === 'object' && data !== null ? `${Object.keys(data).length} keys` : ''}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          {/* Expand/Collapse All */}
          <button
            onClick={handleExpandAll}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Expand all"
          >
            <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
          </button>
          <button
            onClick={handleCollapseAll}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Collapse all"
          >
            <Minimize2 className="h-3.5 w-3.5 text-gray-500" />
          </button>

          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Search */}
          {searchable && (
            <button
              onClick={toggleSearch}
              className={`p-1.5 rounded transition-colors ${
                showSearch
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'
              }`}
              title="Search (Ctrl+F)"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Copy All */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search keys and values..."
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* JSON Content */}
      {jsonContent}
    </div>
  );
}

/**
 * Inline JSON viewer without card wrapper
 * Useful for embedding in other components
 */
export function InlineJson({
  data,
  maxHeight = 300,
  expanded = true,
  depth = 2,
  showToolbar = true,
  title,
}: {
  data: JsonValue;
  maxHeight?: number | string;
  expanded?: boolean;
  depth?: number;
  showToolbar?: boolean;
  title?: string;
}) {
  return (
    <JsonViewer
      data={data}
      inline={true}
      maxHeight={maxHeight}
      initialExpanded={expanded}
      maxInitialDepth={depth}
      searchable={true}
      showToolbar={showToolbar}
      title={title}
    />
  );
}
