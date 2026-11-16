// One `label  value` line of a note: the label indented two spaces and padded
// to a fixed column. A label that fills the column still keeps a two-space gap.
export function row(label: string, value: string): string {
  const left = `  ${label}`;
  return `${left.padEnd(Math.max(28, left.length + 2))}${value}`;
}
