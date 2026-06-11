export function row(label: string, value: string): string {
  const left = `  ${label}`.padEnd(28);
  return `${left}${value}`;
}

/**
 * Trim a (possibly long) manifest description down to its first clause for a
 * one-line wizard hint. Splits on an em-dash, a semicolon, or a sentence-ending
 * period (dot followed by whitespace) — never a bare `.`, so "Next.js" survives.
 * Caps the result at 80 chars with an ellipsis.
 */
export function shortDescription(text: string): string {
  const first = text.split(/[—;]|\.\s/)[0]!.trim();
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}
