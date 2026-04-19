/**
 * SQLite string literal escaping utilities.
 */

/**
 * Escape a string value for safe embedding inside a SQLite single-quoted literal.
 * Replaces every single-quote with two single-quotes per SQLite spec.
 *
 * Usage: `stmt: \`WHERE box = '${escapeSqliteLiteral(id)}'\``
 */
export function escapeSqliteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
