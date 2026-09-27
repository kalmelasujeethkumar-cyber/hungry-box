/**
 * Hungry Box business reporting time.
 *
 * Every branch operates in India and `Asia/Kolkata` has observed a constant UTC+05:30
 * with no daylight saving since 1945, so a fixed offset is exact and keeps reporting
 * boundaries independent of the host timezone. Timestamps are still stored and compared
 * as UTC instants; only the *calendar* a reporting figure is bucketed into moves.
 *
 * A bare `YYYY-MM-DD` in a query string is parsed by `Date` as UTC midnight, which is
 * 05:30 IST. Passing such a value straight to a database comparison therefore silently
 * drops the first 5h30m of the day the caller asked for, so report boundaries must be
 * expanded with {@link resolveBusinessRange} rather than `new Date(raw)`.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export const BUSINESS_OFFSET_MINUTES = 330;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Matches a calendar date with no time or zone designator, e.g. `2026-01-06`. */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Instant -> milliseconds of the same wall-clock reading taken in business time. */
export function toBusinessWallMs(date: Date): number {
  return date.getTime() + BUSINESS_OFFSET_MINUTES * MINUTE_MS;
}

/** Milliseconds of a business-time wall clock -> the real instant. */
export function fromBusinessWallMs(wallMs: number): Date {
  return new Date(wallMs - BUSINESS_OFFSET_MINUTES * MINUTE_MS);
}

/** Calendar fields of `date` as read in business time. */
export function businessParts(date: Date): { year: number; month: number; day: number } {
  const wall = new Date(toBusinessWallMs(date));
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth(),
    day: wall.getUTCDate(),
  };
}

/** 00:00:00.000 business time on the calendar day containing `date`. */
export function startOfBusinessDay(date: Date): Date {
  const { year, month, day } = businessParts(date);
  return fromBusinessWallMs(Date.UTC(year, month, day));
}

/** 23:59:59.999 business time on the calendar day containing `date`. */
export function endOfBusinessDay(date: Date): Date {
  return new Date(startOfBusinessDay(date).getTime() + DAY_MS - 1);
}

/**
 * Inclusive business-time bounds for a reporting range.
 *
 * A bare `YYYY-MM-DD` bound is treated as that whole business day, so `from = to =
 * 2026-01-06` selects Jan 6 in IST rather than the empty 05:30-05:30 window that a raw
 * `new Date(value)` comparison produces. Full ISO timestamps are honoured exactly, which
 * keeps the analytics endpoints' existing behaviour for precise instants.
 */
export function resolveBusinessRange(
  fromRaw?: string,
  toRaw?: string,
): { from: Date; to: Date } {
  const from = fromRaw ? boundaryInstant(fromRaw, 'start') : new Date(0);
  const to = toRaw ? boundaryInstant(toRaw, 'end') : new Date();
  return { from, to };
}

function boundaryInstant(raw: string, edge: 'start' | 'end'): Date {
  const trimmed = raw.trim();
  if (BARE_DATE.test(trimmed)) {
    const day = new Date(`${trimmed}T00:00:00.000Z`);
    return edge === 'start' ? startOfBusinessDay(day) : endOfBusinessDay(day);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * Business-time timestamp for a CSV cell: `2026-01-06 17:00:00 +05:30`.
 *
 * Management exports must read in the same clock as the dashboards that produced them.
 * The offset is stated explicitly so a reader never has to assume which zone applied.
 */
export function formatBusinessTimestamp(date: Date): string {
  const wall = new Date(toBusinessWallMs(date));
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())} ` +
    `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())} +05:30`
  );
}
