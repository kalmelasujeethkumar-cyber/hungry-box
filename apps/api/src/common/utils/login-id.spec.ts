import { describe, expect, it } from 'vitest';
import { normalizeLoginId } from '../utils/login-id';

describe('normalizeLoginId', () => {
  it('trims and lowercases email-style login ids', () => {
    expect(normalizeLoginId('  Admin@Gmail.com ')).toBe('admin@gmail.com');
  });

  it('preserves username-style ids that contain @ (e.g. shiva@)', () => {
    expect(normalizeLoginId('shiva@')).toBe('shiva@');
  });

  it('preserves plain usernames exactly', () => {
    expect(normalizeLoginId('branch1')).toBe('branch1');
  });
});
