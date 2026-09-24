const ORIGIN_URL_PATTERN = /^https?:\/\/[^/\s]+\/?$/i;

/**
 * Normalizes the CORS_ORIGINS environment value into an allow-list for both the
 * HTTP API and the Socket.IO adapter.
 *
 * - comma-separated origins, each trimmed; empty entries are ignored
 * - a wildcard "*" is rejected because the API always enables credentials
 * - every origin must be an absolute http(s) URL without a path; a single
 *   trailing slash is normalized away so it matches the browser Origin header;
 *   anything else fails loudly instead of silently producing an
 *   insecure/no-op policy
 */
export function parseCorsOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const entries = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const origins: string[] = [];
  for (const entry of entries) {
    if (entry === '*') {
      throw new Error(
        'CORS_ORIGINS must not contain "*" (wildcard origins are rejected because the API enables credentials)',
      );
    }
    if (!ORIGIN_URL_PATTERN.test(entry)) {
      throw new Error(
        `CORS_ORIGINS contains an invalid origin "${entry}" (expected an absolute http:// or https:// URL without a path)`,
      );
    }
    origins.push(entry.replace(/\/+$/, ''));
  }
  return origins;
}
