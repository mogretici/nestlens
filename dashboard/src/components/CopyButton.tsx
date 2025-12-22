import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface CopyButtonProps {
  text: string;
  label?: string;
  successMessage?: string;
  className?: string;
  iconOnly?: boolean;
}

export default function CopyButton({
  text,
  label = 'Copy',
  successMessage = 'Copied to clipboard!',
  className = '',
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(successMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (iconOnly) {
    return (
      <button
        onClick={handleCopy}
        className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${className}`}
        title={label}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4 text-gray-500" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-lg
        bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
        text-gray-700 dark:text-gray-300 transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
