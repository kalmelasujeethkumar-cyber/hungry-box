import { useRef } from 'react';
import { createIdempotencyAttempt, type IdempotencyAttempt } from './idempotency-attempt';

/**
 * Keeps one idempotency key owner alive for the lifetime of the component so
 * that re-renders never discard the key of an in-flight checkout attempt.
 */
export function useIdempotencyAttempt(): IdempotencyAttempt {
  const attempt = useRef<IdempotencyAttempt | null>(null);
  if (attempt.current === null) {
    attempt.current = createIdempotencyAttempt();
  }
  return attempt.current;
}
