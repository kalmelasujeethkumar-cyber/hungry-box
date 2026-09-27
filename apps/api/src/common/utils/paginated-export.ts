import { PayloadTooLargeException } from '@nestjs/common';

/** Rows fetched per database round trip while assembling an export. */
export const EXPORT_CHUNK_SIZE = 1000;

/**
 * Ceiling on a single export. Reaching it is an explicit, reported refusal rather than a
 * quietly shortened file: a manager is told to narrow the range or filters instead of
 * being handed an incomplete CSV that looks complete. Real exports are orders of magnitude
 * below this, so the limit exists only to bound memory on a pathological query.
 */
export const EXPORT_MAX_ROWS = 100_000;

/**
 * Reads every row matching a query, in bounded chunks, so an export is never limited by a
 * single `take` and can never silently drop records.
 *
 * `fetchPage` must apply a stable `orderBy` including a unique tiebreaker; otherwise
 * `skip`/`take` paging can repeat or skip rows between chunks when many rows share a
 * sort value.
 */
export async function collectAllForExport<T>(
  fetchPage: (args: { skip: number; take: number }) => Promise<T[]>,
  what: string,
): Promise<T[]> {
  const collected: T[] = [];

  for (;;) {
    const page = await fetchPage({ skip: collected.length, take: EXPORT_CHUNK_SIZE });
    for (const row of page) collected.push(row);

    if (page.length < EXPORT_CHUNK_SIZE) return collected;
    if (collected.length >= EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException(
        `This ${what} export would exceed ${EXPORT_MAX_ROWS} rows. ` +
          'Narrow the date range, branch, or filters and export again.',
      );
    }
  }
}
