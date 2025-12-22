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

/**
 * Hook for managing multiple hash values
 */
export function useUrlHashState<T extends Record<string, string>>(
  defaults: T
): [T, (key: keyof T, value: string) => void, () => void] {
  const getHashState = useCallback((): T => {
    if (typeof window === 'undefined') return defaults;

    const hash = window.location.hash.slice(1);
    if (!hash) return defaults;

    try {
      const params = new URLSearchParams(hash);
      const state = { ...defaults };

      for (const key of Object.keys(defaults)) {
        const value = params.get(key);
        if (value !== null) {
          (state as Record<string, string>)[key] = value;
        }
      }

      return state;
    } catch {
      return defaults;
    }
  }, [defaults]);

  const [state, setState] = useState<T>(getHashState);

  useEffect(() => {
    const handleHashChange = () => {
      setState(getHashState());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [getHashState]);

  const setHashValue = useCallback((key: keyof T, value: string) => {
    setState(prev => {
      const newState = { ...prev, [key]: value };

      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);

      if (value === defaults[key]) {
        params.delete(key as string);
      } else {
        params.set(key as string, value);
      }

      const newHash = params.toString();
      const newUrl = newHash ? `#${newHash}` : window.location.pathname + window.location.search;
      window.history.replaceState(null, '', newUrl);

      return newState;
    });
  }, [defaults]);

  const clearHash = useCallback(() => {
    setState(defaults);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [defaults]);

  return [state, setHashValue, clearHash];
}

export default useUrlHash;
