'use client';

import React, { useCallback, useMemo, useRef, DependencyList } from 'react';

/**
 * useDeepMemo - Memoize a value with deep comparison of dependencies
 */
export function useDeepMemo<T>(factory: () => T, deps: DependencyList | undefined): T {
  const ref = useRef<{ deps?: DependencyList; value: T }>({
    deps,
    value: factory(),
  });

  const depsEqual = (a?: DependencyList, b?: DependencyList): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }

    return true;
  };

  const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
    }

    return true;
  };

  if (!depsEqual(ref.current.deps, deps)) {
    ref.current = {
      deps,
      value: factory(),
    };
  }

  return ref.current.value;
}

/**
 * useDebounce - Debounce a value
 */
export function useDebounce<T>(value: T, delayMs: number = 500): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * useDebounceCallback - Debounce a callback function
 */
export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number = 500
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    (...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delayMs);
    },
    [callback, delayMs]
  ) as T;
}

/**
 * useThrottle - Throttle a value
 */
export function useThrottle<T>(value: T, delayMs: number = 1000): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());

  React.useEffect(() => {
    const now = Date.now();

    if (now >= lastUpdated.current + delayMs) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, delayMs - (now - lastUpdated.current));

      return () => clearTimeout(timer);
    }
  }, [value, delayMs]);

  return throttledValue;
}

/**
 * useAsync - Handle async operations with loading, data, and error states
 */
export function useAsync<T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true
) {
  const [status, setStatus] = React.useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<E | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      return response;
    } catch (error) {
      setError(error as E);
      setStatus('error');
      throw error;
    }
  }, [asyncFunction]);

  React.useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { execute, status, data, error };
}

/**
 * usePrevious - Get the previous value of a prop or state
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  React.useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * useLocalStorage - Manage state synced with localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = React.useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error writing to localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * useEffectAsync - Effect hook for async operations
 */
export function useEffectAsync(
  effect: () => Promise<void | (() => void)>,
  deps?: DependencyList
) {
  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      const cleanup = await effect();
      if (isMounted && cleanup) {
        return cleanup;
      }
    })();

    return () => {
      isMounted = false;
    };
  }, deps);
}

export default {
  useDeepMemo,
  useDebounce,
  useDebounceCallback,
  useThrottle,
  useAsync,
  usePrevious,
  useLocalStorage,
  useEffectAsync,
};
