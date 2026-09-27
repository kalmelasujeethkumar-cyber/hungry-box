/**
 * Client-side owner of an order idempotency key.
 *
 * The server treats an idempotency key as the identity of one order-placement
 * attempt: a repeat of the same key replays the stored order instead of
 * creating a second one. A key therefore has to stay stable for the whole
 * logical attempt, including across a retry that follows an ambiguous failure
 * (for example a lost response to a request the server already committed).
 *
 * The key is rotated only when the order being placed would genuinely differ,
 * or once the attempt has conclusively finished.
 */
export interface IdempotencyAttempt {
  /**
   * Returns the key for the current logical attempt, generating one on first
   * use. Repeated calls with the same scope return the same key, so concurrent
   * or repeated interaction can never produce two keys for one attempt.
   */
  keyFor(scope: string): string;
  /**
   * Concludes the current attempt. The next placement is a genuinely new one
   * and receives a fresh key.
   */
  complete(): void;
}

/**
 * Identifies what is being ordered. The key rotates when this changes, because
 * reusing a key across a different address or a different order path would make
 * the server replay the earlier, different order instead of creating this one.
 */
export function orderAttemptScope(path: 'online' | 'cod', addressId: string): string {
  return `${path}:${addressId}`;
}

export function createIdempotencyAttempt(generate: () => string = defaultKey): IdempotencyAttempt {
  let scope: string | null = null;
  let key: string | null = null;

  return {
    keyFor(nextScope: string): string {
      if (key === null || scope !== nextScope) {
        scope = nextScope;
        key = generate();
      }
      return key;
    },
    complete(): void {
      scope = null;
      key = null;
    },
  };
}

function defaultKey(): string {
  return crypto.randomUUID();
}
