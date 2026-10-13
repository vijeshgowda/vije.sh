/**
 * Member search: a case-insensitive "contains" match with ILIKE. The user's text is a literal, so
 * the LIKE wildcards `%` and `_` and the escape character `\` are escaped, and the SQL names `\` as
 * the escape character (`ilike $1 escape '\'`). The pattern is still passed as a parameter.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The ILIKE pattern for "contains `text`", or null to match everyone. */
export function containsPattern(text: string): string | null {
  const t = text.trim();
  return t ? `%${escapeLike(t)}%` : null;
}
