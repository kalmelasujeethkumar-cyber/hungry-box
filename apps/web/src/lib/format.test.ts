import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatDateTime } from './format';

describe('formatDateTime', () => {
  it('returns an em dash for an unparseable value', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });

  it('renders a readable stamp containing the calendar year', () => {
    const formatted = formatDateTime('2026-01-05T10:00:00.000Z');
    expect(formatted).not.toBe('—');
    expect(formatted).toContain('2026');
  });
});

describe('formatDateOnly', () => {
  it('returns an em dash for an unparseable value', () => {
    expect(formatDateOnly('not-a-date')).toBe('—');
    expect(formatDateOnly('')).toBe('—');
  });

  it('renders a readable date containing the calendar year', () => {
    const formatted = formatDateOnly('2026-01-05T10:00:00.000Z');
    expect(formatted).not.toBe('—');
    expect(formatted).toContain('2026');
  });
});
