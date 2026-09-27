import { useMemo, useRef } from 'react';

/**
 * Guards asynchronous list loads against out-of-order responses.
 *
 * A management list can have several requests in flight at once - a debounced search plus
 * a filter change plus a page move. Whichever resolves last wins, which is not
 * necessarily the request the user is waiting for: a slow broad "all partners" response
 * could land after a fast "search = ravi" response and silently replace the filtered rows
 * with unfiltered ones.
 *
 * `begin()` returns a token; pass it back to `isCurrent()` and drop the response if another
 * request has started since. Only the newest request is allowed to write state.
 *
 * The returned handle is referentially stable, so it is safe in a `useCallback` dependency
 * list. A fresh object per render would re-create every callback that closed over it and
 * re-run the effects that call it, which turns the list into a refetch loop that also wipes
 * the error state of whatever the user just submitted.
 */
export function useLatestRequest(): {
  begin: () => number;
  isCurrent: (token: number) => boolean;
} {
  const latest = useRef(0);

  return useMemo(
    () => ({
      begin: () => {
        latest.current += 1;
        return latest.current;
      },
      isCurrent: (token: number) => token === latest.current,
    }),
    [],
  );
}
