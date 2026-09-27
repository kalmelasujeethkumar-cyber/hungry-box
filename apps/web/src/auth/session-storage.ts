import type { AuthUser } from '@hungrybox/shared';

export interface StoredSession {
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = 'hungrybox.session';

/**
 * Records that the last session ended because the server rejected the token, rather than
 * because the user signed out.
 *
 * Without this, an expired session is indistinguishable from a deliberate logout: the user
 * is bounced to the login screen with no explanation and no idea that anything went wrong,
 * which reads as a random sign-out. The flag holds no secret - it is a boolean, never a
 * token - and it is read once by the login screen, which then clears it.
 */
const SESSION_EXPIRED_KEY = 'hungrybox.session-expired';

export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
  } catch {
    // A browser with storage disabled still gets the redirect; only the explanation is lost.
  }
}

export function consumeSessionExpiredFlag(): boolean {
  try {
    const flagged = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    if (flagged) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.token || !parsed.user) return null;
    return { token: parsed.token, user: parsed.user };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
