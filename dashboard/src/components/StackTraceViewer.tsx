import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface StackFrame {
  raw: string;
  functionName: string;
  file: string;
  line?: number;
  column?: number;
  isVendor: boolean;
  isApp: boolean;
}

interface StackTraceViewerProps {
  stack: string;
  initialFrames?: number;
}

/**
 * Parse a single stack frame line
 */
function parseStackFrame(frameLine: string): StackFrame | null {
  const trimmed = frameLine.trim();
  if (!trimmed || !trimmed.startsWith('at ')) {
    return null;
  }

  // Common patterns:
  // at functionName (file:line:column)
  // at file:line:column
  // at async functionName (file:line:column)

  const withParens = trimmed.match(/^at\s+(async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
  const withoutParens = trimmed.match(/^at\s+(.+?):(\d+):(\d+)$/);

  let functionName = '<anonymous>';
  let file = '';
  let lineNum: number | undefined;
  let column: number | undefined;

  if (withParens) {
    functionName = (withParens[1] ? 'async ' : '') + withParens[2];
    file = withParens[3];
    lineNum = parseInt(withParens[4], 10);
    column = parseInt(withParens[5], 10);
  } else if (withoutParens) {
    file = withoutParens[1];
    lineNum = parseInt(withoutParens[2], 10);
    column = parseInt(withoutParens[3], 10);
  } else {
    // Fallback - just extract what we can
    const fallback = trimmed.match(/^at\s+(.+)$/);
    if (fallback) {
      functionName = fallback[1];
    }
  }

  const isVendor = file.includes('node_modules') ||
                   file.includes('internal/') ||
                   file.startsWith('node:');
  const isApp = !isVendor && file.length > 0;

  return {
    raw: trimmed,
    functionName,
    file,
    line: lineNum,
    column,
    isVendor,
    isApp,
  };
}

/**
 * Parse stack trace string into frames
 */
function parseStackTrace(stack: string): { message: string; frames: StackFrame[] } {
  const lines = stack.split('\n');

  // First line(s) are usually the error message
  const messageLines: string[] = [];
  const frameLines: string[] = [];

  let foundFirstFrame = false;
  for (const line of lines) {
    if (line.trim().startsWith('at ')) {
      foundFirstFrame = true;
      frameLines.push(line);
    } else if (!foundFirstFrame) {
      messageLines.push(line);
    } else {
      frameLines.push(line);
    }
  }

  const frames = frameLines
    .map(parseStackFrame)
    .filter((f): f is StackFrame => f !== null);

  return {
    message: messageLines.join('\n').trim(),
    frames,
  };
}

export default function StackTraceViewer({
  stack,
  initialFrames = 5
}: StackTraceViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { message, frames } = useMemo(() => parseStackTrace(stack), [stack]);

  // Find first app frame (the origin of the error)
  const firstAppFrameIndex = frames.findIndex(f => f.isApp);

  const displayFrames = expanded ? frames : frames.slice(0, initialFrames);
  const hiddenCount = frames.length - initialFrames;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stack);
      setCopied(true);
      toast.success('Stack trace copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Stack Trace
        </h2>
        <button
          onClick={handleCopy}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Copy stack trace"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4 text-gray-500" />
          )}
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 overflow-x-auto">
        {/* Error message */}
        {message && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <pre className="text-sm text-red-700 dark:text-red-400 font-mono whitespace-pre-wrap">
              {message}
            </pre>
          </div>
        )}

        {/* Stack frames */}
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {displayFrames.map((frame, index) => {
            const isOrigin = index === firstAppFrameIndex;
            const isVendor = frame.isVendor;

            return (
              <div
                key={index}
                className={`px-4 py-2 font-mono text-sm ${
                  isOrigin
                    ? 'bg-red-100 dark:bg-red-900/30 border-l-2 border-red-500'
                    : isVendor
                    ? 'opacity-60'
                    : ''
                }`}
              >
                <span className="text-gray-500 dark:text-gray-500 mr-2 select-none">
                  {String(index + 1).padStart(2, ' ')}.
                </span>
                <span className={isOrigin ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}>
                  {frame.functionName}
                </span>
                {frame.file && (
                  <>
                    <span className="text-gray-500 dark:text-gray-500 mx-1">at</span>
                    <span className={isVendor ? 'text-gray-500 dark:text-gray-500' : 'text-emerald-700 dark:text-green-400'}>
                      {frame.file}
                    </span>
                    {frame.line && (
                      <span className="text-amber-700 dark:text-yellow-400">
                        :{frame.line}
                        {frame.column && `:${frame.column}`}
                      </span>
                    )}
                  </>
                )}
                {isOrigin && (
                  <span className="ml-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">
                    origin
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Show more/less button */}
        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>Show less</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span>Show {hiddenCount} more frames</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
