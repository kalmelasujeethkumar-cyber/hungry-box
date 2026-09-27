import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delayMs` so a keystroke does not immediately become a request.
 *
 * Used for management list search boxes, where every character otherwise produces a query
 * against the database and the later responses race each other.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
