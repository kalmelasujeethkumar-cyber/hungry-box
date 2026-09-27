import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TIME_ZONE,
  formatBusinessDateOnly,
  formatBusinessDateTime,
  formatBusinessPlacedAt,
  toBusinessISODate,
} from './business-time';

describe('BUSINESS_TIME_ZONE', () => {
  it('reports in Hungry Box business time', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Kolkata');
  });
});

describe('toBusinessISODate', () => {
  it('keeps an instant inside the same business day', () => {
    // 15:30 IST on 5 Jan.
    expect(toBusinessISODate(new Date('2026-01-05T10:00:00.000Z'))).toBe('2026-01-05');
  });

  it('rolls an instant past business midnight to the next day', () => {
    // 05:29:59 IST on 5 Jan is still the 5th; 05:30 IST is already the 6th.
    expect(toBusinessISODate(new Date('2026-01-04T23:59:59.000Z'))).toBe('2026-01-05');
    expect(toBusinessISODate(new Date('2026-01-04T18:30:00.000Z'))).toBe('2026-01-05');
  });

  it('rolls an instant before business midnight back to the previous day', () => {
    // 00:30 IST on 6 Jan.
    expect(toBusinessISODate(new Date('2026-01-05T19:00:00.000Z'))).toBe('2026-01-06');
    // 23:30 IST on 5 Jan.
    expect(toBusinessISODate(new Date('2026-01-05T18:00:00.000Z'))).toBe('2026-01-05');
  });

  it('places 18:29:59Z on the following business day, which a UTC calendar would not', () => {
    // 23:59:59 IST on 5 Jan, still 5 Jan in UTC terms on the 5th at 18:29Z.
    expect(toBusinessISODate(new Date('2026-01-05T18:29:59.000Z'))).toBe('2026-01-05');
  });
});

describe('formatBusinessDateTime', () => {
  it('returns an em dash for an unparseable value', () => {
    expect(formatBusinessDateTime('not-a-date')).toBe('—');
    expect(formatBusinessDateTime('')).toBe('—');
  });

  it('renders the business calendar day, not the UTC one', () => {
    // 23:30 IST on 5 Jan, which is 18:00Z on the 5th.
    expect(formatBusinessDateTime('2026-01-05T18:00:00.000Z')).toBe('05 Jan 2026, 11:30 pm');
  });

  it('shows the next business day once IST midnight has passed', () => {
    // 00:30 IST on 6 Jan, which is still 19:00Z on the 5th.
    expect(formatBusinessDateTime('2026-01-05T19:00:00.000Z')).toBe('06 Jan 2026, 12:30 am');
  });
});

describe('formatBusinessDateOnly', () => {
  it('returns an em dash for an unparseable value', () => {
    expect(formatBusinessDateOnly('not-a-date')).toBe('—');
    expect(formatBusinessDateOnly('')).toBe('—');
  });

  it('renders the business calendar day', () => {
    expect(formatBusinessDateOnly('2026-01-05T18:00:00.000Z')).toBe('05 Jan 2026');
    expect(formatBusinessDateOnly('2026-01-05T19:00:00.000Z')).toBe('06 Jan 2026');
  });
});

describe('formatBusinessPlacedAt', () => {
  it('returns an em dash for an unparseable value', () => {
    expect(formatBusinessPlacedAt('not-a-date')).toBe('—');
    expect(formatBusinessPlacedAt('')).toBe('—');
  });

  it('renders a compact stamp for the business day of the order', () => {
    expect(formatBusinessPlacedAt('2026-01-05T18:00:00.000Z')).toBe('5 Jan, 11:30 pm');
  });
});
