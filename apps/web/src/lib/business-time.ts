/**
 * Hungry Box business reporting timezone. Every branch operates in India, and
 * Asia/Kolkata has observed a constant UTC+05:30 with no daylight saving since 1945.
 * Management timestamps and reporting ranges are pinned to it so they match the
 * server's business-day boundaries regardless of the browser's timezone.
 *
 * `lib/format.ts` stays on browser-local time on purpose: the Customer and Delivery
 * Partner surfaces read best in the viewer's own timezone. Only management reporting
 * should use these helpers.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const BUSINESS_OFFSET_MINUTES = 330;
const MINUTE_MS = 60 * 1000;

function toBusinessWallMs(date: Date): number {
  return date.getTime() + BUSINESS_OFFSET_MINUTES * MINUTE_MS;
}

export function formatBusinessDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

export function formatBusinessDateOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

/** The business calendar day an instant falls on, as `YYYY-MM-DD` for a date input. */
export function toBusinessISODate(date: Date): string {
  return new Date(toBusinessWallMs(date)).toISOString().slice(0, 10);
}

/** Compact stamp for order lists, where the year adds noise but not clarity. */
export function formatBusinessPlacedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}
