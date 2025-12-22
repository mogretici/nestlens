import { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

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
