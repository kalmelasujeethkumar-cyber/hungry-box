import { describe, expect, it } from 'vitest';
import { createIdempotencyAttempt, orderAttemptScope } from './idempotency-attempt';

/** Deterministic generator so key identity, not randomness, is under test. */
function counterGenerator(): () => string {
  let n = 0;
  return () => `key-${++n}`;
}

describe('orderAttemptScope', () => {
  it('distinguishes the online path from the cod path for the same address', () => {
    expect(orderAttemptScope('online', 'addr-1')).not.toBe(orderAttemptScope('cod', 'addr-1'));
  });

  it('distinguishes different addresses on the same path', () => {
    expect(orderAttemptScope('cod', 'addr-1')).not.toBe(orderAttemptScope('cod', 'addr-2'));
  });

  it('is stable for the same path and address', () => {
    expect(orderAttemptScope('online', 'addr-1')).toBe(orderAttemptScope('online', 'addr-1'));
  });
});

describe('createIdempotencyAttempt', () => {
  it('generates a key on the first attempt', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    expect(attempt.keyFor('cod:addr-1')).toBe('key-1');
  });

  it('reuses the same key when the same logical attempt is retried', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const first = attempt.keyFor('cod:addr-1');
    const retry = attempt.keyFor('cod:addr-1');
    expect(retry).toBe(first);
  });

  it('does not rotate the key after an ambiguous failure', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const first = attempt.keyFor('online:addr-1');
    // The request failed in a way that leaves the outcome unknown; the caller
    // retries without completing the attempt, so the key must not change.
    const afterAmbiguousRetry = attempt.keyFor('online:addr-1');
    expect(afterAmbiguousRetry).toBe(first);
    // A second ambiguous retry is still the same attempt.
    expect(attempt.keyFor('online:addr-1')).toBe(first);
  });

  it('cannot produce two different keys for repeated interaction within one attempt', () => {
    const generate = counterGenerator();
    const attempt = createIdempotencyAttempt(generate);
    const keys = [
      attempt.keyFor('online:addr-1'),
      attempt.keyFor('online:addr-1'),
      attempt.keyFor('online:addr-1'),
    ];
    expect(new Set(keys).size).toBe(1);
  });

  it('ends the attempt on completion so the next attempt gets a new key', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const first = attempt.keyFor('cod:addr-1');
    attempt.complete();
    expect(attempt.keyFor('cod:addr-1')).toBe('key-2');
    expect(attempt.keyFor('cod:addr-1')).not.toBe(first);
  });

  it('rotates the key when the address changes, so a stale order is not replayed', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const first = attempt.keyFor('cod:addr-1');
    expect(attempt.keyFor('cod:addr-2')).toBe('key-2');
    expect(attempt.keyFor('cod:addr-2')).not.toBe(first);
  });

  it('rotates the key when switching between the cod and online paths', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const codKey = attempt.keyFor('cod:addr-1');
    const onlineKey = attempt.keyFor('online:addr-1');
    expect(onlineKey).not.toBe(codKey);
    // Switching back starts a new attempt rather than replaying the cod order.
    expect(attempt.keyFor('cod:addr-1')).toBe('key-3');
  });

  it('keeps the cod path stable across retries, like the online path', () => {
    const attempt = createIdempotencyAttempt(counterGenerator());
    const first = attempt.keyFor('cod:addr-1');
    expect(attempt.keyFor('cod:addr-1')).toBe(first);
    attempt.complete();
    expect(attempt.keyFor('cod:addr-1')).not.toBe(first);
  });

  it('generates a cryptographically strong key by default', () => {
    const attempt = createIdempotencyAttempt();
    const key = attempt.keyFor('cod:addr-1');
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(attempt.keyFor('cod:addr-1')).toBe(key);
  });

  it('does not reuse a key between two independent attempts', () => {
    const generate = counterGenerator();
    const first = createIdempotencyAttempt(generate);
    const second = createIdempotencyAttempt(generate);
    expect(first.keyFor('cod:addr-1')).toBe('key-1');
    expect(second.keyFor('cod:addr-1')).toBe('key-2');
  });
});
