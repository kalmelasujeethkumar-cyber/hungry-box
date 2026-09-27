import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';
import { useLatestRequest } from './use-latest-request';

describe('useDebouncedValue', () => {
  it('holds the old value while the user is still typing', async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
        initialProps: { value: '' },
      });

      rerender({ value: 'r' });
      rerender({ value: 'ra' });
      rerender({ value: 'rav' });
      /** Three keystrokes, but still nothing new to query - the point of the debounce. */
      expect(result.current).toBe('');

      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current).toBe('rav');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the wait on each keystroke so only the last one commits', async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
        initialProps: { value: 'a' },
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      rerender({ value: 'ab' });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      /** 'a' had 200ms of the original 300; 'ab' resets the clock instead of inheriting it. */
      expect(result.current).toBe('a');

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current).toBe('ab');
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes the value straight through when no delay is wanted', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 0), {
      initialProps: { value: 'x' },
    });
    rerender({ value: 'y' });
    await waitFor(() => expect(result.current).toBe('y'));
  });
});

describe('useLatestRequest', () => {
  it('accepts only the most recently started request', () => {
    const { result } = renderHook(() => useLatestRequest());

    const first = result.current.begin();
    const second = result.current.begin();

    /**
     * The whole point: a slow earlier query must not be allowed to overwrite the rows the
     * user is currently reading, even if it resolves after the newer one.
     */
    expect(result.current.isCurrent(second)).toBe(true);
    expect(result.current.isCurrent(first)).toBe(false);
  });

  it('keeps only the newest request current across many calls', () => {
    const { result } = renderHook(() => useLatestRequest());
    const tokens = [1, 2, 3, 4].map(() => result.current.begin());

    const newest = tokens[tokens.length - 1] as number;
    expect(result.current.isCurrent(newest)).toBe(true);
    for (const token of tokens.slice(0, -1)) {
      expect(result.current.isCurrent(token)).toBe(false);
    }
  });

  it('returns the same handle across renders', () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const first = result.current;

    rerender();
    rerender();

    /**
     * The handle is used inside a useCallback dependency list. A new object per render
     * would re-create the loader on every render, re-run the effect that calls it, and
     * refetch forever - silently wiping the error banner on each pass.
     */
    expect(result.current).toBe(first);
  });

  it('keeps counting across renders when memoized', () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const first = result.current.begin();
    rerender();

    const second = result.current.begin();
    expect(result.current.isCurrent(second)).toBe(true);
    expect(result.current.isCurrent(first)).toBe(false);
  });
});
