import { useState, useEffect } from 'react';
import { Play, Pause, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRecordingStatus, pauseRecording, resumeRecording, RecordingStatus } from '../api';

export default function RecordingControl() {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await getRecordingStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch recording status:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (!status) return;

    setLoading(true);
    try {
      if (status.isPaused) {
        const response = await resumeRecording();
        setStatus(response.data);
        toast.success('Recording resumed');
      } else {
        const response = await pauseRecording();
        setStatus(response.data);
        toast.success('Recording paused');
      }
    } catch (error) {
      toast.error('Failed to toggle recording');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${status.isPaused
            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50'
            : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
          }
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        aria-label={status.isPaused ? 'Resume recording' : 'Pause recording'}
      >
        <Circle
          className={`h-3 w-3 ${status.isPaused ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400 animate-pulse'}`}
          fill="currentColor"
        />
        <span className="hidden sm:inline">
          {status.isPaused ? 'Paused' : 'Recording'}
        </span>
        {status.isPaused ? (
          <Play className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Pause className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      {status.isPaused && status.pauseReason && (
        <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">
          {status.pauseReason}
        </span>
      )}
    </div>
  );
}
