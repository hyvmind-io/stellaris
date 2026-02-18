/**
 * Escape LIKE metacharacters in a user-supplied search term for use with
 * SQLite LIKE expressions.
 *
 * SQLite LIKE special characters:
 *   %  → matches any sequence of characters
 *   _  → matches any single character
 *   \  → the escape character (when ESCAPE '\' is specified)
 *
 * Usage with Drizzle:
 *   sql`${table.col} LIKE ${'%' + escapeLike(term) + '%'} ESCAPE '\'`
 *
 * The calling code MUST include `ESCAPE '\'` in the LIKE expression.
 */
export function escapeLike(term: string): string {
  return term
    .replace(/\\/g, "\\\\") // escape the escape character first
    .replace(/%/g, "\\%") // escape percent wildcard
    .replace(/_/g, "\\_"); // escape underscore wildcard
}
