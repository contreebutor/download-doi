/**
 * Minimal ini parser with Python `configparser` semantics, which the npm `ini`
 * package does not match: section names keep their dots (`[scihub.task]` is one
 * section, not a nested object), `;` and `#` only start a comment at the
 * beginning of a line, and values are kept verbatim so a value like `#pdf`
 * survives.
 */
export type IniSection = Record<string, string>;
export type IniFile = Record<string, IniSection>;

const SECTION_RE = /^\[(.+)\]$/;

export function parseIni(text: string): IniFile {
  const result: IniFile = {};
  let current: IniSection | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(';') || line.startsWith('#')) continue;

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch !== null) {
      const name = (sectionMatch[1] ?? '').trim();
      current = result[name] ?? {};
      result[name] = current;
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1 || current === null) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key.length > 0) {
      current[key] = value;
    }
  }

  return result;
}
