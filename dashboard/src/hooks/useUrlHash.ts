import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for persisting state in URL hash
 * Enables shareable links to specific tabs/states
 */
export function useUrlHash<T extends string>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const getHashValue = useCallback((): T => {
    if (typeof window === 'undefined') return defaultValue;

    const hash = window.location.hash.slice(1); // Remove #
    if (!hash) return defaultValue;

    try {
      const params = new URLSearchParams(hash);
      const value = params.get(key);
      return (value as T) || defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const [value, setValue] = useState<T>(getHashValue);

  // Update state when hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      setValue(getHashValue());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [getHashValue]);

  // Update URL hash when value changes
  const setHashValue = useCallback((newValue: T) => {
    setValue(newValue);

    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    if (newValue === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, newValue);
    }

    const newHash = params.toString();
    const newUrl = newHash ? `#${newHash}` : window.location.pathname + window.location.search;

    window.history.replaceState(null, '', newUrl);
  }, [key, defaultValue]);

  return [value, setHashValue];
}

export default useUrlHash;
