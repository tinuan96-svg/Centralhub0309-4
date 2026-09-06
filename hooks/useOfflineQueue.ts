import { useState, useEffect, useCallback } from 'react';

/**
 * Improvement #6: Offline-First Reliability
 * Persists the current state of a picking or packing queue to LocalStorage.
 * Ensures that if a user loses Wi-Fi or refreshes, their progress is saved.
 */
export function useOfflineQueue<T>(key: string, initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`offline_queue_${key}`);
    if (saved) {
      try {
        setState(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse offline queue:', e);
      }
    }
  }, [key]);

  // Save to storage whenever state changes
  const updateState = useCallback((newState: T | ((prev: T) => T)) => {
    setState(prev => {
      const updated = typeof newState === 'function'
        ? (newState as Function)(prev)
        : newState;
      localStorage.setItem(`offline_queue_${key}`, JSON.stringify(updated));
      return updated;
    });
  }, [key]);

  const clearQueue = useCallback(() => {
    localStorage.removeItem(`offline_queue_${key}`);
    setState(initialState);
  }, [key, initialState]);

  return {
    state,
    updateState,
    clearQueue,
    isSyncing
  };
}
