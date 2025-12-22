import { useState, useMemo } from 'react';
import { format as formatSql } from 'sql-formatter';
import { Copy, Check, Code, AlignLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { JsonValue } from '../types';

interface SqlViewerProps {
  query: string;
  parameters?: JsonValue[];
  duration?: number;
  slow?: boolean;
}

// SQL keyword highlighting
const sqlKeywords = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'DISTINCT',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW',
  'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'LIKE', 'BETWEEN', 'EXISTS',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CASCADE', 'CONSTRAINT',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION'
];

function highlightSql(sql: string): string {
  let highlighted = sql;

  // Escape HTML
  highlighted = highlighted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight strings (single quotes)
  highlighted = highlighted.replace(
    /'([^']*)'/g,
    '<span class="sql-string">\'$1\'</span>'
  );

  // Highlight numbers
  highlighted = highlighted.replace(
    /\b(\d+)\b/g,
    '<span class="sql-number">$1</span>'
  );

  // Highlight parameters ($1, $2, ?, :param)
  highlighted = highlighted.replace(
    /(\$\d+|\?|:\w+)/g,
    '<span class="sql-param">$1</span>'
  );

  // Highlight keywords (case-insensitive)
  const keywordPattern = new RegExp(`\\b(${sqlKeywords.join('|')})\\b`, 'gi');
  highlighted = highlighted.replace(
    keywordPattern,
    '<span class="sql-keyword">$1</span>'
  );

  return highlighted;
}

export default function SqlViewer({
  query,
  parameters,
  duration,
  slow
}: SqlViewerProps) {
  const [formatted, setFormatted] = useState(true);
  const [copied, setCopied] = useState(false);

  const displaySql = useMemo(() => {
    if (!formatted) return query;
    try {
      return formatSql(query, {
        language: 'postgresql',
        keywordCase: 'upper',
        indentStyle: 'standard',
      });
    } catch {
      return query;
    }
  }, [query, formatted]);

  const highlightedSql = useMemo(() => highlightSql(displaySql), [displaySql]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displaySql);
      setCopied(true);
      toast.success('SQL copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            SQL Query
          </h2>
          {duration !== undefined && (
            <span className={`text-sm font-medium ${
              slow
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {duration}ms
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFormatted(!formatted)}
            className={`p-2 rounded-lg transition-colors ${
              formatted
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
            }`}
            title={formatted ? 'Show raw SQL' : 'Format SQL'}
          >
            {formatted ? (
              <AlignLeft className="h-4 w-4" />
            ) : (
              <Code className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleCopy}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Copy SQL"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      {/* SQL Code */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 overflow-x-auto">
        <pre
          className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-100"
          dangerouslySetInnerHTML={{ __html: highlightedSql }}
        />
      </div>

      {/* Parameters */}
      {parameters && parameters.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Parameters:</div>
          <div className="flex flex-wrap gap-2">
            {parameters.map((param, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-sm font-mono"
              >
                <span className="text-purple-600 dark:text-purple-400 mr-1">${index + 1}:</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {param === null ? (
                    <span className="text-gray-400 dark:text-gray-500">NULL</span>
                  ) : typeof param === 'string' ? (
                    <span className="text-green-600 dark:text-green-400">'{param}'</span>
                  ) : (
                    <span className="text-amber-600 dark:text-yellow-400">{String(param)}</span>
                  )}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
