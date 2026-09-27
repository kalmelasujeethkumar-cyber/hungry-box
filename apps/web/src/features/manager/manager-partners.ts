/**
 * Page size for the management partner lists.
 *
 * Matches the API default for `/branch/partners`, and the API caps any larger request at
 * `PARTNER_LIST_MAX_LIMIT`. Keeping the two in step means the page size the UI renders
 * matches the page size the server actually applied.
 */
export const PARTNER_PAGE_SIZE = 50;
