import { useState, useCallback } from 'react';

export function usePreventDoubleClick<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T,
  delay: number = 1000
): [T, boolean] {
  const [isExecuting, setIsExecuting] = useState(false);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      if (isExecuting) {
        return;
      }

      setIsExecuting(true);

      try {
        const result = await asyncFunction(...args);
        return result;
      } finally {
        setTimeout(() => {
          setIsExecuting(false);
        }, delay);
      }
    },
    [asyncFunction, delay, isExecuting]
  ) as T;

  return [execute, isExecuting];
}

export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T
): [T, boolean, Error | null] {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      if (isLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFunction(...args);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFunction, isLoading]
  ) as T;

  return [execute, isLoading, error];
}
