/** Broadcast when an authenticated request receives HTTP 401, so the auth
 * context can drop the invalid local session in one place instead of each
 * screen reacting to a stale token. */
export const SESSION_EXPIRED_EVENT = 'hungrybox:session-expired';

export function notifySessionExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
