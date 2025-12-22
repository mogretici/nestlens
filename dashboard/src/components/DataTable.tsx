import { ReactNode, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, Inbox } from 'lucide-react';
import { getBadgeColor } from './ClickableBadge';

// Column definition
export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  sticky?: boolean;
  sortable?: boolean;
  render: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  showChevron?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  maxHeight?: string;
  zebraStripes?: boolean;
  rowClassName?: (row: T) => string;
}

// Skeleton loading component
function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="animate-pulse">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Empty state component
function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
        {icon || <Inbox className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
        {message}
      </p>
    </div>
  );
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  showChevron = true,
  compact = false,
  stickyHeader = true,
  maxHeight,
  zebraStripes = false,
  rowClassName,
}: DataTableProps<T>) {
  const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-3';
  const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3';
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);

  // Calculate total columns including chevron
  const totalColumns = columns.length + (showChevron && onRowClick ? 1 : 0);

  const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, row: T, index: number) => {
      if (!onRowClick) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          onRowClick(row);
          setSelectedRowIndex(index);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (index < data.length - 1) {
            setFocusedRowIndex(index + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (index > 0) {
            setFocusedRowIndex(index - 1);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedRowIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedRowIndex(data.length - 1);
          break;
      }
    },
    [onRowClick, data.length]
  );

  // Focus the row when focusedRowIndex changes
  useEffect(() => {
    if (focusedRowIndex >= 0 && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr[tabindex]');
      const targetRow = rows[focusedRowIndex] as HTMLElement;
      if (targetRow) {
        targetRow.focus();
      }
    }
  }, [focusedRowIndex]);

  return (
    <div className="card overflow-hidden">
      <div
        className={`overflow-x-auto ${maxHeight ? 'overflow-y-auto' : ''}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          ref={tableRef}
          className="w-full border-collapse"
          role="grid"
          aria-rowcount={data.length}
          aria-colcount={totalColumns}
        >
          {/* Table Header */}
          <thead
            className={`bg-gray-50 dark:bg-gray-800/50 ${
              stickyHeader ? 'sticky top-0 z-10' : ''
            }`}
          >
            <tr role="row">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  role="columnheader"
                  aria-sort={column.sortable ? 'none' : undefined}
                  className={`
                    ${headerPadding}
                    ${getAlignmentClass(column.headerAlign || column.align)}
                    text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider
                    border-b border-gray-200 dark:border-gray-700
                    bg-gray-50 dark:bg-gray-800/50
                    whitespace-nowrap
                    ${column.sticky ? 'sticky left-0 z-20' : ''}
                  `}
                  style={{
                    width: column.width,
                    minWidth: column.minWidth,
                  }}
                >
                  {column.header}
                </th>
              ))}
              {/* Chevron column header */}
              {showChevron && onRowClick && (
                <th
                  scope="col"
                  role="columnheader"
                  className={`
                    ${headerPadding}
                    w-12
                    border-b border-gray-200 dark:border-gray-700
                    bg-gray-50 dark:bg-gray-800/50
                  `}
                  aria-label="Expand row"
                />
              )}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <TableSkeleton columns={totalColumns} rows={5} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={totalColumns}>
                  <EmptyState message={emptyMessage} icon={emptyIcon} />
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={keyExtractor(row)}
                  role="row"
                  aria-rowindex={index + 1}
                  aria-selected={onRowClick && selectedRowIndex === index ? true : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row, index) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`
                    group
                    transition-colors duration-150
                    ${onRowClick ? 'cursor-pointer' : ''}
                    ${
                      zebraStripes && index % 2 === 1
                        ? 'bg-gray-50/50 dark:bg-gray-800/25'
                        : 'bg-white dark:bg-gray-900'
                    }
                    hover:bg-primary-50/50 dark:hover:bg-primary-900/10
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset
                    ${selectedRowIndex === index ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                    ${rowClassName ? rowClassName(row) : ''}
                  `}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      role="gridcell"
                      className={`
                        ${cellPadding}
                        ${getAlignmentClass(column.align)}
                        ${column.sticky ? 'sticky left-0 z-10 bg-inherit' : ''}
                      `}
                      style={{
                        width: column.width,
                        minWidth: column.minWidth,
                      }}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                  {/* Chevron */}
                  {showChevron && onRowClick && (
                    <td className={`${cellPadding} w-12 text-right`} role="gridcell">
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors inline-block" aria-hidden="true" />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper components for common cell types

interface TextCellProps {
  children: ReactNode;
  mono?: boolean;
  truncate?: boolean;
  maxWidth?: string;
  secondary?: boolean;
  className?: string;
}

export function TextCell({
  children,
  mono = false,
  truncate = false,
  maxWidth,
  secondary = false,
  className = '',
}: TextCellProps) {
  return (
    <span
      className={`
        text-sm
        ${mono ? 'font-mono' : ''}
        ${secondary ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}
        ${truncate ? 'block truncate' : ''}
        ${className}
      `}
      style={maxWidth ? { maxWidth, display: 'block' } : undefined}
      title={truncate && typeof children === 'string' ? children : undefined}
    >
      {children}
    </span>
  );
}

interface NumberCellProps {
  value: number | string;
  suffix?: string;
  prefix?: string;
  highlight?: 'success' | 'warning' | 'error' | 'info';
}

export function NumberCell({ value, suffix = '', prefix = '', highlight }: NumberCellProps) {
  const highlightClasses = {
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <span
      className={`text-sm font-mono tabular-nums ${
        highlight ? highlightClasses[highlight] : 'text-gray-600 dark:text-gray-300'
      }`}
    >
      {prefix}
      {value}
      {suffix}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, variant = 'default', size = 'sm' }: StatusBadgeProps) {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center font-bold uppercase tracking-wide rounded
        ${variantClasses[variant]}
        ${sizeClasses[size]}
      `}
    >
      {status}
    </span>
  );
}

interface TimeCellProps {
  date: Date | string;
  format?: 'relative' | 'absolute';
  formatter?: (date: Date) => string;
}

export function TimeCell({ date, format = 'relative', formatter }: TimeCellProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  let displayText: string;
  if (formatter) {
    displayText = formatter(dateObj);
  } else if (format === 'relative') {
    // Simple relative time calculation
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) displayText = 'just now';
    else if (diffMins < 60) displayText = `${diffMins}m ago`;
    else if (diffHours < 24) displayText = `${diffHours}h ago`;
    else if (diffDays < 7) displayText = `${diffDays}d ago`;
    else displayText = dateObj.toLocaleDateString();
  } else {
    displayText = dateObj.toLocaleString();
  }

  return (
    <span
      className="text-sm text-gray-500 dark:text-gray-400"
      title={dateObj.toLocaleString()}
    >
      {displayText}
    </span>
  );
}

interface TagsListProps {
  tags: string[];
  max?: number;
  onTagClick?: (tag: string, e: React.MouseEvent) => void;
}

export function TagsList({ tags, max = 3, onTagClick }: TagsListProps) {
  const visibleTags = tags.slice(0, max);
  const remainingCount = tags.length - max;

  if (tags.length === 0) {
    return <span className="text-sm text-gray-400 dark:text-gray-500">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleTags.map((tag) => (
        <button
          key={tag}
          onClick={onTagClick ? (e) => onTagClick(tag, e) : undefined}
          className={`
            inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
            ${getBadgeColor(tag)}
            ${onTagClick ? 'cursor-pointer hover:scale-105' : ''}
            transition-transform
          `}
        >
          {tag.toUpperCase()}
        </button>
      ))}
      {remainingCount > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

// HTTP Method badge with colors
interface MethodBadgeProps {
  method: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function MethodBadge({ method, onClick }: MethodBadgeProps) {
  const colorClass = getBadgeColor(method);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {method.toUpperCase()}
    </button>
  );
}

// HTTP Status code badge with colors
interface StatusCodeBadgeProps {
  code: number;
  onClick?: (e: React.MouseEvent) => void;
}

export function StatusCodeBadge({ code, onClick }: StatusCodeBadgeProps) {
  const colorClass = getBadgeColor(String(code));

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {code}
    </button>
  );
}

// Duration display with color coding
interface DurationCellProps {
  ms: number;
  slowThreshold?: number;
  verySlowThreshold?: number;
}

export function DurationCell({ ms, slowThreshold = 1000, verySlowThreshold = 5000 }: DurationCellProps) {
  let colorClass: string;
  let displayValue: string;

  if (ms >= verySlowThreshold) {
    colorClass = 'text-red-600 dark:text-red-400';
  } else if (ms >= slowThreshold) {
    colorClass = 'text-yellow-600 dark:text-yellow-400';
  } else {
    colorClass = 'text-gray-600 dark:text-gray-300';
  }

  // Format duration
  if (ms >= 1000) {
    displayValue = `${(ms / 1000).toFixed(2)}s`;
  } else {
    displayValue = `${ms}ms`;
  }

  return (
    <span className={`text-sm font-mono tabular-nums ${colorClass}`}>
      {displayValue}
    </span>
  );
}

// Log level badge with colors
interface LogLevelBadgeProps {
  level: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function LogLevelBadge({ level, onClick }: LogLevelBadgeProps) {
  const colorClass = getBadgeColor(level);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {level.toUpperCase()}
    </button>
  );
}

// Job status badge with colors
interface JobStatusBadgeProps {
  status: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function JobStatusBadge({ status, onClick }: JobStatusBadgeProps) {
  const colorClass = getBadgeColor(status);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {status.toUpperCase()}
    </button>
  );
}

// Cache operation badge
interface CacheOperationBadgeProps {
  operation: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function CacheOperationBadge({ operation, onClick }: CacheOperationBadgeProps) {
  const colorClass = getBadgeColor(operation);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {operation.toUpperCase()}
    </button>
  );
}

// Cache hit/miss badge
interface CacheHitBadgeProps {
  hit: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function CacheHitBadge({ hit, onClick }: CacheHitBadgeProps) {
  const label = hit ? 'HIT' : 'MISS';
  const colorClass = getBadgeColor(label);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {label}
    </button>
  );
}

// Mail status badge
interface MailStatusBadgeProps {
  status: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function MailStatusBadge({ status, onClick }: MailStatusBadgeProps) {
  const colorClass = getBadgeColor(status);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {status.toUpperCase()}
    </button>
  );
}

// Schedule status badge
interface ScheduleStatusBadgeProps {
  status: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function ScheduleStatusBadge({ status, onClick }: ScheduleStatusBadgeProps) {
  const colorClass = getBadgeColor(status);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {status.toUpperCase()}
    </button>
  );
}

// Source badge (for queries - TypeORM, Prisma, etc.)
interface SourceBadgeProps {
  source: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function SourceBadge({ source, onClick }: SourceBadgeProps) {
  const colorClass = getBadgeColor(source);

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shadow
        ${colorClass}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        transition-transform
      `}
    >
      {source.toUpperCase()}
    </button>
  );
}
