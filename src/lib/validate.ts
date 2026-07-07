export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

// pharn-core, pharn-stack-nextjs, … (matches scripts/schemas/*.schema.json).
export const MODULE_NAME_RE = /^pharn-[a-z0-9-]+$/;
export const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// installs source/destination paths: relative, no leading slash, no empty
// segments (rejects "/etc/x", "a//b", "/"). Optional single trailing slash.
export const INSTALL_PATH_RE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*\/?$/;
// Wizard answer values + ids (e.g. "supabase", "better-auth", "skip").
export const WIZARD_VALUE_RE = /^[a-z0-9-]+$/;
// degit-compatible vendor skill source (e.g. "github:supabase/skills/foo",
// "user/repo#main", "https://github.com/user/repo"). Handed to degit, so kept
// to a strict allowlist and additionally checked for '..' / control chars.
export const VENDOR_SOURCE_RE = /^[A-Za-z0-9@:/._#-]+$/;
// npm package names: optional @scope/, then lowercase letters, digits, '-',
// '_', '.'. Compared against package.json keys (never path-joined), but kept
// strict + checked for '..' for defense in depth.
export const PACKAGE_NAME_RE =
  /^(@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/;
// Capability directory basename (archetype install): lowercase alnum words joined
// by single hyphens, no leading/trailing/double hyphen (e.g. `a11y`, `n-plus-one`,
// `copy-paste-drift`). Tighter than WIZARD_VALUE_RE. Every capability name read
// from the fetched tree is validated with this before it is path-joined (P2).
export const CAPABILITY_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A product command / hook filename copied from the fetched tree (validated
// before path-join). `pharn-plan.md`, `set-writes-scope.cjs`, etc.
export const COPY_FILENAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.(md|cjs|mjs|json)$/;
// Capability `role` frontmatter enum — the two installable kinds shipped today
// (ARCHITECTURE.md §3.1 role enum, narrowed consumer-side).
export const ROLE_VALUES = ['griller', 'lens'] as const;
// Capability `applies` frontmatter tokens: `universal` (→ always selected) or a
// project archetype (ssr|backend|spa|lib). Membership, not judgment (P5).
export const APPLIES_TOKEN_VALUES = [
  'universal',
  'ssr',
  'backend',
  'spa',
  'lib',
] as const;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/;

/**
 * Assert a fetched capability `role` value is one of the installable kinds
 * ({griller, lens}); hard-fail otherwise (P2/P5 — no silent trust of untrusted
 * frontmatter). `label` names the offending capability in the error.
 */
export function assertRole(
  value: unknown,
  label: string,
): (typeof ROLE_VALUES)[number] {
  if (typeof value !== 'string') {
    throw new ManifestValidationError(`${label} role must be a string`);
  }
  const match = ROLE_VALUES.find((r) => r === value);
  if (!match) {
    throw new ManifestValidationError(
      `${label} has invalid role ${JSON.stringify(value)} (expected one of ${ROLE_VALUES.join(', ')})`,
    );
  }
  return match;
}

/**
 * Assert a single fetched `applies` token is a known enum value
 * ({universal, ssr, backend, spa, lib}); hard-fail otherwise (P2/P5).
 */
export function assertAppliesToken(
  value: string,
  label: string,
): (typeof APPLIES_TOKEN_VALUES)[number] {
  const match = APPLIES_TOKEN_VALUES.find((t) => t === value);
  if (!match) {
    throw new ManifestValidationError(
      `${label} has invalid applies value ${JSON.stringify(value)} (expected one of ${APPLIES_TOKEN_VALUES.join(', ')})`,
    );
  }
  return match;
}

export function assertSafeString(
  value: unknown,
  label: string,
  pattern: RegExp,
): string {
  if (typeof value !== 'string') {
    throw new ManifestValidationError(`${label} must be a string`);
  }
  if (CONTROL_CHARS_RE.test(value)) {
    throw new ManifestValidationError(`${label} contains control characters`);
  }
  if (!pattern.test(value)) {
    throw new ManifestValidationError(
      `${label} has invalid format: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function assertNoDotDot(value: string, label: string): void {
  if (value.includes('..')) {
    throw new ManifestValidationError(`${label} must not contain '..'`);
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
