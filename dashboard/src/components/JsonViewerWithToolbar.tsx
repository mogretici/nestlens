import { useState, useCallback, ReactNode } from 'react';
import { Copy, Check, Search, X, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { JsonValue } from '../types';
import JsonViewer from './JsonViewer';

export interface JsonToolbarState {
  expandAllTrigger: number;
  collapseAllTrigger: number;
  showSearch: boolean;
  searchTerm: string;
}

/**
 * Hook that provides toolbar controls for JSON viewers
 * Returns toolbar component and state to pass to ControlledInlineJson
 */
export function useJsonToolbar() {
  const [state, setState] = useState<JsonToolbarState>({
    expandAllTrigger: 0,
    collapseAllTrigger: 0,
    showSearch: false,
    searchTerm: '',
  });
  const [copied, setCopied] = useState(false);

  const handleExpandAll = useCallback(() => {
    setState(prev => ({ ...prev, expandAllTrigger: prev.expandAllTrigger + 1 }));
  }, []);

  const handleCollapseAll = useCallback(() => {
    setState(prev => ({ ...prev, collapseAllTrigger: prev.collapseAllTrigger + 1 }));
  }, []);

  const toggleSearch = useCallback(() => {
    setState(prev => ({
      ...prev,
      showSearch: !prev.showSearch,
      searchTerm: prev.showSearch ? '' : prev.searchTerm,
    }));
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    setState(prev => ({ ...prev, searchTerm: term }));
  }, []);

  const handleCopy = useCallback(async (data: JsonValue) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  const Toolbar = ({ data }: { data?: JsonValue }) => (
    <div className="flex items-center space-x-1">
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
      <button
        onClick={toggleSearch}
        className={`p-1.5 rounded transition-colors ${
          state.showSearch
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'
        }`}
        title="Search"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      {data && (
        <button
          onClick={() => handleCopy(data)}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Copy JSON"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>
      )}
    </div>
  );

  const SearchBar = (
    state.showSearch ? (
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={state.searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search keys and values..."
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
          />
          {state.searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    ) : null
  );

  return {
    state,
    Toolbar,
    SearchBar,
  };
}

interface ControlledInlineJsonProps {
  data: JsonValue;
  toolbarState: JsonToolbarState;
  maxHeight?: number | string;
  searchBar?: ReactNode;
}

/**
 * InlineJson that responds to external toolbar controls
 */
export function ControlledInlineJson({
  data,
  toolbarState,
  maxHeight = 400,
  searchBar,
}: ControlledInlineJsonProps) {
  // Use key to force re-render when expand/collapse is triggered
  const key = `${toolbarState.expandAllTrigger}-${toolbarState.collapseAllTrigger}`;

  // Determine initial state based on triggers
  const isExpanded = toolbarState.expandAllTrigger > toolbarState.collapseAllTrigger;
  const depth = isExpanded ? 100 : (toolbarState.collapseAllTrigger > 0 ? 0 : 2);

  return (
    <div>
      {searchBar}
      <JsonViewer
        key={key}
        data={data}
        inline={true}
        maxHeight={maxHeight}
        initialExpanded={isExpanded || toolbarState.expandAllTrigger === 0}
        maxInitialDepth={depth}
        searchable={false}
        showToolbar={false}
        externalSearchTerm={toolbarState.searchTerm}
      />
    </div>
  );
}
