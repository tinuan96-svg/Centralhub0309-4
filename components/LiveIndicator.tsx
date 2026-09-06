'use client';

import { useState, useEffect } from 'react';

interface LiveIndicatorProps {
  isLive?: boolean;
  lastUpdated?: Date | string | null;
  showTimestamp?: boolean;
  className?: string;
}

export default function LiveIndicator({
  isLive = false,
  lastUpdated,
  showTimestamp = true,
  className = '',
}: LiveIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return;

    const updateTimeAgo = () => {
      const now = new Date();
      const updatedDate = new Date(lastUpdated);
      const diffInSeconds = Math.floor((now.getTime() - updatedDate.getTime()) / 1000);

      if (diffInSeconds < 5) {
        setTimeAgo('just now');
      } else if (diffInSeconds < 60) {
        setTimeAgo(`${diffInSeconds}s ago`);
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        setTimeAgo(`${hours}h ago`);
      } else {
        const days = Math.floor(diffInSeconds / 86400);
        setTimeAgo(`${days}d ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 10000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {isLive && (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-emerald-400">LIVE</span>
        </div>
      )}

      {showTimestamp && lastUpdated && (
        <span className="text-xs text-slate-500">
          Updated {timeAgo}
        </span>
      )}
    </div>
  );
}
