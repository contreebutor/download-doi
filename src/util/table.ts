/** Minimal psql-style table renderer, matching SciDownl's `domain.list` output. */
export function renderTable(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length), 0),
  );

  const separator = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const divider = `|${widths.map((width) => '-'.repeat(width + 2)).join('+')}|`;

  // Headers are left-aligned, numeric columns right-aligned, as tablib does.
  const isNumericColumn = headers.map((_header, column) =>
    rows.length > 0 && rows.every((row) => /^-?\d+(\.\d+)?$/.test(row[column] ?? '')),
  );

  const renderRow = (cells: readonly string[], alignNumeric: boolean): string =>
    `|${cells
      .map((cell, column) => {
        const width = widths[column] ?? cell.length;
        const padded =
          alignNumeric && isNumericColumn[column] === true ? cell.padStart(width) : cell.padEnd(width);
        return ` ${padded} `;
      })
      .join('|')}|`;

  const lines = [separator, renderRow(headers, false), divider];
  for (const row of rows) {
    lines.push(renderRow(row, true));
  }
  lines.push(separator);
  return lines.join('\n');
}
