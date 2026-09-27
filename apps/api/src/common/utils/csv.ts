/**
 * CSV generation for management exports.
 *
 * Two concerns are handled together here so every export behaves identically:
 *
 * 1. RFC 4180 structure. Commas, double quotes and line breaks inside a value force the
 *    whole cell to be quoted, and embedded quotes are doubled. Joining with `\n` and
 *    quoting any cell containing a newline is a valid RFC 4180 file that Excel, LibreOffice
 *    and Google Sheets all parse back to the original values.
 *
 * 2. Spreadsheet formula injection. A cell whose text begins with `=`, `+`, `-`, `@`, TAB,
 *    CR or LF is executed as a formula by Excel and Sheets when the file is opened, so a
 *    free-text field such as an audit `message` or a branch name can become code in the
 *    reader's spreadsheet. Those values are prefixed with an apostrophe, which spreadsheets
 *    treat as "this is text".
 *
 *    The prefix is applied only when the value would actually be interpreted as a formula,
 *    so legitimate data is untouched. Strictly numeric text (including negative amounts)
 *    is exempt: it is emitted unquoted and remains a number in the spreadsheet rather than
 *    being demoted to text by the apostrophe.
 */

/** A CSV value is either a primitive or `null`/`undefined` for an empty cell. */
export type CsvValue = string | number | boolean | null | undefined;

const NEEDS_QUOTING = /[",\n\r]/;
const FORMULA_LEAD = /^[=+\-@\t\r\n]/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = String(value);

  const looksNumeric = NUMERIC.test(text.trim());
  if (!looksNumeric && FORMULA_LEAD.test(text)) {
    text = `'${text}`;
  }

  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Builds a complete CSV document from an explicit header and pre-ordered rows.
 *
 * `header` is a plain list of names and `rows` a list of already-ordered value tuples, so
 * the column order is chosen deliberately by the caller and can never drift with
 * JavaScript object-property ordering. Callers are responsible for the row order.
 */
export function buildCsvDocument(header: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}
