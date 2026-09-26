import { describe, expect, it } from 'vitest';
import { toISODate } from './format';

describe('toISODate', () => {
  it('formats a date in local time as an ISO calendar day', () => {
    expect(toISODate(new Date(2026, 8, 24))).toBe('2026-09-24');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 3, 9))).toBe('2026-04-09');
  });
});