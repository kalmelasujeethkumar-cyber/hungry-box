import { describe, expect, it } from 'vitest';
import { parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('returns an empty allow-list for missing or blank input', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins(null)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });

  it('parses a comma-separated list, trimming whitespace and ignoring empty entries', () => {
    expect(parseCorsOrigins(' https://app.example.com ,  http://localhost:5173,,')).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
    ]);
  });

  it('keeps development localhost origins', () => {
    expect(parseCorsOrigins('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });

  it('rejects a wildcard origin because credentials are enabled', () => {
    expect(() => parseCorsOrigins('*')).toThrow(/wildcard/);
    expect(() => parseCorsOrigins('https://a.com, *')).toThrow(/wildcard/);
  });

  it('rejects an origin that is not an absolute http(s) URL', () => {
    expect(() => parseCorsOrigins('localhost:5173')).toThrow(/invalid origin/);
    expect(() => parseCorsOrigins('ftp://a.com')).toThrow(/invalid origin/);
    expect(() => parseCorsOrigins('not-an-origin')).toThrow(/invalid origin/);
  });

  it('rejects an origin that carries a path', () => {
    expect(() => parseCorsOrigins('https://app.example.com/some-path')).toThrow(/invalid origin/);
  });

  it('normalizes a trailing slash so it matches the browser Origin header', () => {
    expect(parseCorsOrigins('https://app.example.com/')).toEqual(['https://app.example.com']);
  });
});
