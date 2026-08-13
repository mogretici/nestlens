import { ReactNode } from 'react';
import { JsonToolbarState } from './useJsonToolbar';
import { JsonValue } from '../types';
import JsonViewer from './JsonViewer';

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
