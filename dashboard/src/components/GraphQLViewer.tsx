import { useState, useCallback, useMemo, useEffect } from 'react';
import { Copy, Check, Search, X, Maximize2, Minimize2, ChevronRight, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface GraphQLViewerProps {
  query: string;
  maxHeight?: number | string;
}

interface GraphQLNode {
  type: 'operation' | 'field' | 'argument' | 'directive' | 'fragment' | 'variable-def' | 'selection-set' | 'inline-fragment';
  name?: string;
  operationType?: string;
  alias?: string;
  arguments?: { name: string; value: string }[];
  directives?: { name: string; arguments?: { name: string; value: string }[] }[];
  variableDefinitions?: { name: string; type: string; defaultValue?: string }[];
  typeCondition?: string;
  children?: GraphQLNode[];
  raw?: string;
}

// Simple GraphQL tokenizer
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (inString) {
      current += char;
      if (char === stringChar && query[i - 1] !== '\\') {
        tokens.push(current);
        current = '';
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (current) tokens.push(current);
      current = char;
      inString = true;
      stringChar = char;
      continue;
    }

    if (/[\s,]/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }

    if (/[{}():\[\]!$@]/.test(char)) {
      if (current) tokens.push(current);
      tokens.push(char);
      current = '';
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

// Parse tokens into tree structure
function parseGraphQL(query: string): GraphQLNode[] {
  const tokens = tokenize(query);
  const nodes: GraphQLNode[] = [];
  let pos = 0;

  function parseSelectionSet(): GraphQLNode[] {
    const selections: GraphQLNode[] = [];
    if (tokens[pos] !== '{') return selections;
    pos++; // skip {

    while (pos < tokens.length && tokens[pos] !== '}') {
      const node = parseSelection();
      if (node) selections.push(node);
    }
    pos++; // skip }
    return selections;
  }

  function parseSelection(): GraphQLNode | null {
    if (tokens[pos] === '...') {
      pos++;
      if (tokens[pos] === 'on') {
        // Inline fragment
        pos++; // skip 'on'
        const typeCondition = tokens[pos++];
        const children = parseSelectionSet();
        return { type: 'inline-fragment', typeCondition, children };
      } else {
        // Fragment spread
        const name = tokens[pos++];
        return { type: 'fragment', name };
      }
    }

    // Field or alias
    let name = tokens[pos++];
    let alias: string | undefined;

    if (tokens[pos] === ':') {
      pos++; // skip :
      alias = name;
      name = tokens[pos++];
    }

    // Arguments
    let args: { name: string; value: string }[] | undefined;
    if (tokens[pos] === '(') {
      args = [];
      pos++; // skip (
      while (pos < tokens.length && tokens[pos] !== ')') {
        const argName = tokens[pos++];
        if (tokens[pos] === ':') {
          pos++; // skip :
          let value = '';
          // Handle nested objects/arrays in arguments
          let depth = 0;
          while (pos < tokens.length) {
            const t = tokens[pos];
            if (t === '{' || t === '[') depth++;
            if (t === '}' || t === ']') depth--;
            if (depth === 0 && (t === ')' || (tokens[pos + 1] === ':'))) break;
            value += t + ' ';
            pos++;
          }
          args.push({ name: argName, value: value.trim() });
        }
      }
      if (tokens[pos] === ')') pos++;
    }

    // Directives
    let directives: { name: string; arguments?: { name: string; value: string }[] }[] | undefined;
    while (tokens[pos] === '@') {
      pos++; // skip @
      const directiveName = tokens[pos++];
      directives = directives || [];
      const directive: { name: string; arguments?: { name: string; value: string }[] } = { name: directiveName };

      if (tokens[pos] === '(') {
        directive.arguments = [];
        pos++; // skip (
        while (pos < tokens.length && tokens[pos] !== ')') {
          const argName = tokens[pos++];
          if (tokens[pos] === ':') {
            pos++; // skip :
            const argValue = tokens[pos++];
            directive.arguments.push({ name: argName, value: argValue });
          }
        }
        if (tokens[pos] === ')') pos++;
      }
      directives.push(directive);
    }

    // Selection set
    let children: GraphQLNode[] | undefined;
    if (tokens[pos] === '{') {
      children = parseSelectionSet();
    }

    return { type: 'field', name, alias, arguments: args, directives, children };
  }

  function parseOperation(): GraphQLNode | null {
    const opType = tokens[pos];
    if (!['query', 'mutation', 'subscription', 'fragment'].includes(opType)) {
      // Anonymous query - just a selection set
      if (tokens[pos] === '{') {
        const children = parseSelectionSet();
        return { type: 'operation', operationType: 'query', children };
      }
      return null;
    }

    pos++; // skip operation type

    if (opType === 'fragment') {
      const name = tokens[pos++];
      pos++; // skip 'on'
      const typeCondition = tokens[pos++];
      const children = parseSelectionSet();
      return { type: 'fragment', name, typeCondition, children };
    }

    let name: string | undefined;
    let variableDefinitions: { name: string; type: string; defaultValue?: string }[] | undefined;

    // Operation name (optional)
    if (tokens[pos] && tokens[pos] !== '(' && tokens[pos] !== '{') {
      name = tokens[pos++];
    }

    // Variable definitions
    if (tokens[pos] === '(') {
      variableDefinitions = [];
      pos++; // skip (
      while (pos < tokens.length && tokens[pos] !== ')') {
        if (tokens[pos] === '$') {
          pos++; // skip $
          const varName = tokens[pos++];
          pos++; // skip :
          let varType = '';
          while (pos < tokens.length && ![')', '=', '$'].includes(tokens[pos])) {
            varType += tokens[pos++];
          }
          let defaultValue: string | undefined;
          if (tokens[pos] === '=') {
            pos++; // skip =
            defaultValue = tokens[pos++];
          }
          variableDefinitions.push({ name: varName, type: varType.trim(), defaultValue });
        } else {
          pos++;
        }
      }
      if (tokens[pos] === ')') pos++;
    }

    const children = parseSelectionSet();
    return { type: 'operation', operationType: opType, name, variableDefinitions, children };
  }

  while (pos < tokens.length) {
    const node = parseOperation();
    if (node) nodes.push(node);
    else pos++;
  }

  return nodes;
}

// Collapsible node component
function GraphQLNodeView({
  node,
  depth = 0,
  searchTerm,
  defaultExpanded,
}: {
  node: GraphQLNode;
  depth?: number;
  searchTerm?: string;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 16;

  // Check if this node or its children match search
  const matchesSearch = useMemo(() => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    const checkNode = (n: GraphQLNode): boolean => {
      if (n.name?.toLowerCase().includes(term)) return true;
      if (n.alias?.toLowerCase().includes(term)) return true;
      if (n.operationType?.toLowerCase().includes(term)) return true;
      if (n.typeCondition?.toLowerCase().includes(term)) return true;
      if (n.arguments?.some(a => a.name.toLowerCase().includes(term) || a.value.toLowerCase().includes(term))) return true;
      if (n.variableDefinitions?.some(v => v.name.toLowerCase().includes(term) || v.type.toLowerCase().includes(term))) return true;
      if (n.children?.some(checkNode)) return true;
      return false;
    };
    return checkNode(node);
  }, [node, searchTerm]);

  // Auto-expand if matches search
  useEffect(() => {
    if (matchesSearch && searchTerm) {
      setExpanded(true);
    }
  }, [matchesSearch, searchTerm]);

  const highlight = (text: string) => {
    if (!searchTerm) return text;
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">{text.slice(idx, idx + searchTerm.length)}</span>
        {text.slice(idx + searchTerm.length)}
      </>
    );
  };

  const renderHeader = () => {
    const parts: JSX.Element[] = [];

    // Operation type (query, mutation, subscription, fragment)
    if (node.operationType) {
      parts.push(
        <span key="op" className="text-pink-600 dark:text-pink-400 font-medium">
          {highlight(node.operationType)}
        </span>
      );
    }

    // Fragment keyword for inline fragments
    if (node.type === 'inline-fragment') {
      parts.push(
        <span key="spread" className="text-gray-500">...</span>,
        <span key="on" className="text-pink-600 dark:text-pink-400 font-medium ml-1">on</span>
      );
    }

    // Type condition (for fragments)
    if (node.typeCondition) {
      parts.push(
        <span key="type" className="text-yellow-600 dark:text-yellow-400 ml-1">
          {highlight(node.typeCondition)}
        </span>
      );
    }

    // Alias
    if (node.alias) {
      parts.push(
        <span key="alias" className="text-purple-600 dark:text-purple-400 ml-1">
          {highlight(node.alias)}
        </span>,
        <span key="colon" className="text-gray-500">:</span>
      );
    }

    // Name
    if (node.name) {
      const nameColor = node.type === 'operation' || node.type === 'fragment'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-cyan-600 dark:text-cyan-400';
      parts.push(
        <span key="name" className={`${nameColor} ml-1`}>
          {highlight(node.name)}
        </span>
      );
    }

    // Variable definitions
    if (node.variableDefinitions && node.variableDefinitions.length > 0) {
      parts.push(
        <span key="vars" className="text-gray-500 ml-1">
          (
          {node.variableDefinitions.map((v, i) => (
            <span key={i}>
              {i > 0 && <span className="text-gray-500">, </span>}
              <span className="text-orange-500 dark:text-orange-400">${highlight(v.name)}</span>
              <span className="text-gray-500">: </span>
              <span className="text-yellow-600 dark:text-yellow-400">{highlight(v.type)}</span>
              {v.defaultValue && (
                <>
                  <span className="text-gray-500"> = </span>
                  <span className="text-green-600 dark:text-green-400">{v.defaultValue}</span>
                </>
              )}
            </span>
          ))}
          )
        </span>
      );
    }

    // Arguments
    if (node.arguments && node.arguments.length > 0) {
      parts.push(
        <span key="args" className="text-gray-500">
          (
          {node.arguments.map((a, i) => (
            <span key={i}>
              {i > 0 && <span className="text-gray-500">, </span>}
              <span className="text-purple-500 dark:text-purple-400">{highlight(a.name)}</span>
              <span className="text-gray-500">: </span>
              <span className="text-green-600 dark:text-green-400">{highlight(a.value)}</span>
            </span>
          ))}
          )
        </span>
      );
    }

    // Directives
    if (node.directives && node.directives.length > 0) {
      node.directives.forEach((d, i) => {
        parts.push(
          <span key={`dir-${i}`} className="text-pink-500 dark:text-pink-400 ml-1">
            @{d.name}
            {d.arguments && d.arguments.length > 0 && (
              <span className="text-gray-500">
                (
                {d.arguments.map((a, j) => (
                  <span key={j}>
                    {j > 0 && ', '}
                    <span className="text-purple-500">{a.name}</span>: <span className="text-green-600">{a.value}</span>
                  </span>
                ))}
                )
              </span>
            )}
          </span>
        );
      });
    }

    // Opening brace for nodes with children
    if (hasChildren) {
      parts.push(
        <span key="brace" className="text-gray-500 ml-1">{expanded ? '{' : '{ ... }'}</span>
      );
    }

    return parts;
  };

  return (
    <div className={matchesSearch && searchTerm ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
      <div
        className="group flex items-start py-0.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors font-mono text-sm"
        style={{ paddingLeft: indent }}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${hasChildren ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded' : ''}`}
          disabled={!hasChildren}
        >
          {hasChildren && (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 whitespace-nowrap">
          {renderHeader()}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <GraphQLNodeView
              key={i}
              node={child}
              depth={depth + 1}
              searchTerm={searchTerm}
              defaultExpanded={defaultExpanded}
            />
          ))}
          {/* Closing brace */}
          <div
            className="py-0.5 font-mono text-sm text-gray-500"
            style={{ paddingLeft: indent + 20 }}
          >
            {'}'}
          </div>
        </div>
      )}
    </div>
  );
}

// Toolbar state hook
export function useGraphQLToolbar() {
  const [state, setState] = useState({
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

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  const Toolbar = ({ code }: { code: string }) => (
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
      <button
        onClick={() => handleCopy(code)}
        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        title="Copy query"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-gray-500" />
        )}
      </button>
    </div>
  );

  const SearchBar = state.showSearch ? (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={state.searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search fields, arguments..."
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
  ) : null;

  return { state, Toolbar, SearchBar };
}

// Main GraphQL Viewer component
export default function GraphQLViewer({ query, maxHeight = 400 }: GraphQLViewerProps) {
  const { state, Toolbar, SearchBar } = useGraphQLToolbar();

  const nodes = useMemo(() => parseGraphQL(query), [query]);

  // Determine default expanded state
  const defaultExpanded = state.expandAllTrigger > state.collapseAllTrigger || state.expandAllTrigger === 0;
  const key = `${state.expandAllTrigger}-${state.collapseAllTrigger}`;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header with toolbar */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">GraphQL Query</span>
        <Toolbar code={query} />
      </div>

      {/* Search bar */}
      {SearchBar}

      {/* Content */}
      <div
        className="p-3 overflow-auto bg-white dark:bg-gray-900"
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        {nodes.length > 0 ? (
          <div key={key}>
            {nodes.map((node, i) => (
              <GraphQLNodeView
                key={i}
                node={node}
                searchTerm={state.searchTerm}
                defaultExpanded={defaultExpanded}
              />
            ))}
          </div>
        ) : (
          <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
            {query}
          </pre>
        )}
      </div>
    </div>
  );
}

// Inline version without header (for tabs)
export function InlineGraphQLViewer({
  query,
  maxHeight = 400,
  toolbarState,
  searchBar,
}: {
  query: string;
  maxHeight?: number | string;
  toolbarState: ReturnType<typeof useGraphQLToolbar>['state'];
  searchBar: React.ReactNode;
}) {
  const nodes = useMemo(() => parseGraphQL(query), [query]);

  const defaultExpanded = toolbarState.expandAllTrigger > toolbarState.collapseAllTrigger || toolbarState.expandAllTrigger === 0;
  const key = `${toolbarState.expandAllTrigger}-${toolbarState.collapseAllTrigger}`;

  return (
    <div>
      {searchBar}
      <div
        className="p-3 overflow-auto"
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        {nodes.length > 0 ? (
          <div key={key}>
            {nodes.map((node, i) => (
              <GraphQLNodeView
                key={i}
                node={node}
                searchTerm={toolbarState.searchTerm}
                defaultExpanded={defaultExpanded}
              />
            ))}
          </div>
        ) : (
          <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
            {query}
          </pre>
        )}
      </div>
    </div>
  );
}
