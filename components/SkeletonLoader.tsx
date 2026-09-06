'use client';

import { memo } from 'react';

interface SkeletonLoaderProps {
  variant?: 'card' | 'metric' | 'chart' | 'heatmap' | 'list';
  count?: number;
}

const SkeletonLoader = memo(({ variant = 'card', count = 1 }: SkeletonLoaderProps) => {
  if (variant === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 animate-pulse"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 bg-slate-700/50 rounded w-1/3"></div>
              <div className="h-8 w-8 bg-slate-700/50 rounded-lg"></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="h-3 bg-slate-700/50 rounded w-16 mb-2"></div>
                <div className="h-8 bg-slate-700/50 rounded w-12"></div>
              </div>
              <div>
                <div className="h-3 bg-slate-700/50 rounded w-16 mb-2"></div>
                <div className="h-8 bg-slate-700/50 rounded w-12"></div>
              </div>
              <div className="col-span-2">
                <div className="h-3 bg-slate-700/50 rounded w-20 mb-2"></div>
                <div className="h-8 bg-slate-700/50 rounded w-24"></div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/50">
              <div className="h-3 bg-slate-700/50 rounded w-full mb-2"></div>
              <div className="h-2 bg-slate-800/50 rounded-full"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'metric') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 animate-pulse"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-3 bg-slate-700/50 rounded w-16"></div>
              <div className="h-8 w-8 bg-slate-700/50 rounded-full"></div>
            </div>
            <div className="h-10 bg-slate-700/50 rounded w-20"></div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-5 bg-slate-700/50 rounded w-32 mb-2"></div>
            <div className="h-3 bg-slate-700/50 rounded w-48"></div>
          </div>
          <div className="flex gap-2">
            <div className="h-7 bg-slate-700/50 rounded-lg w-20"></div>
            <div className="h-7 bg-slate-700/50 rounded-lg w-20"></div>
            <div className="h-7 bg-slate-700/50 rounded-lg w-20"></div>
          </div>
        </div>
        <div className="h-64 bg-slate-800/30 rounded-xl"></div>
      </div>
    );
  }

  if (variant === 'heatmap') {
    return (
      <div className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 animate-pulse">
        <div className="mb-6">
          <div className="h-5 bg-slate-700/50 rounded w-40 mb-2"></div>
          <div className="h-3 bg-slate-700/50 rounded w-64"></div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-1">
              {Array.from({ length: 24 }).map((_, j) => (
                <div key={j} className="w-8 h-8 bg-slate-800/30 rounded-lg"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900/30 backdrop-blur-xl rounded-xl border border-slate-800/50 p-4 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-4 bg-slate-700/50 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-slate-700/50 rounded w-1/2"></div>
              </div>
              <div className="h-8 bg-slate-700/50 rounded-lg w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
});

SkeletonLoader.displayName = 'SkeletonLoader';

export default SkeletonLoader;
