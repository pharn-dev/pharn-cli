export function row(label: string, value: string): string {
  const left = `  ${label}`.padEnd(28);
  return `${left}${value}`;
}
