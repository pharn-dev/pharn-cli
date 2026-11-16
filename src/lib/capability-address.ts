// Capability address parsing — the `<name>` / `<role>:<name>` form shared by
// `pharn add` and `pharn remove`. An unknown role before the colon is a
// reported error, never a guess.

export interface CapabilityAddress {
  // The capability name (the part after `role:`, or the whole arg).
  name: string;
  // The role filter, when the arg was `<role>:<name>`.
  role?: 'griller' | 'lens';
  // Set when the text before the colon was not a valid role.
  error?: string;
}

export function parseCapabilityArg(arg: string): CapabilityAddress {
  if (!arg.includes(':')) return { name: arg };
  const idx = arg.indexOf(':');
  const role = arg.slice(0, idx);
  const name = arg.slice(idx + 1);
  if (role !== 'griller' && role !== 'lens') {
    return {
      name,
      error: `Unknown role "${role}". Use griller:<name> or lens:<name>.`,
    };
  }
  return { name, role };
}
