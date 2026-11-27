import { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/**
 * The detail views wrap these rows in `<dl className="*:not-first:border-y-0">`,
 * which leaves a separator under the first row only. That is what the v3
 * markup drew, and it is kept on purpose; separating every row is a design
 * change, not a fix.
 */
export default function DetailRow({ label, value, className = '' }: DetailRowProps) {
  return (
    <div className={`grid grid-cols-[180px_1fr] gap-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 ${className}`}>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-white break-all">
        {value}
      </dd>
    </div>
  );
}
