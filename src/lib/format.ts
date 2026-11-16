// One `label  value` line of a note: the label indented two spaces and padded
// to a fixed column, then the value. A label that fills or overflows the column
// still keeps a two-space gap, so it never runs into its value (CORE-168).
export function row(label: string, value: string): string {
  const left = `  ${label}`;
  return `${left.padEnd(Math.max(28, left.length + 2))}${value}`;
}
