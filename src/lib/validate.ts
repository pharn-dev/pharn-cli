import { resolve, sep } from 'node:path';

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// Capability directory basename (archetype install): lowercase alnum words joined
// by single hyphens, no leading/trailing/double hyphen (e.g. `a11y`, `n-plus-one`,
// `copy-paste-drift`). Every capability name read from the fetched tree is
// validated with this before it is path-joined (P2).
export const CAPABILITY_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A product command / hook filename copied from the fetched tree (validated
// before path-join). `pharn-plan.md`, `set-writes-scope.cjs`, etc.
export const COPY_FILENAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.(md|cjs|mjs|json)$/;
// A full commit SHA — 40 lowercase hex chars (the degit/GitHub form). The
// network-derived sha (src/lib/repo.ts, fetchCommitSha) is validated against this
// before it is used as a degit ref or recorded as pharn.config.json `commit` (P2);
// `null` (degraded mode, LIMITS.md §3b) is handled by the caller's null-guard.
export const COMMIT_RE = /^[0-9a-f]{40}$/;
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

// Defense-in-depth against path traversal in fetched/copied paths (already
// validated by CAPABILITY_NAME_RE upstream, but never let a copy or read escape
// its base directory). This is the LEXICAL gate (resolve +
// startsWith); it does NOT resolve symlinks — the symlink-aware backstop lives
// at the copy write sites in install-capabilities.ts (P2). Co-located with the
// other structural-validation primitives (one security-validation axis, P3);
// the archetype install + drift check + remove all guard their fs access with it.
export function safeJoin(base: string, rel: string): string {
  const target = resolve(base, rel);
  const root = resolve(base);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ManifestValidationError(
      `Refusing path escape: ${rel} resolves outside ${base}`,
    );
  }
  return target;
}

// Normalize a dest/relpath to a posix, no-trailing-slash key. Purely LEXICAL —
// it rewrites the string and touches no filesystem — which is why it lives here
// beside safeJoin rather than in a consumer (one lexical-path axis, P3). Shared
// by the install manifest's map keys and by symlink-guard.ts, which normalizes
// before splitting its components.
//
// It converts the PLATFORM separator, so what it does depends on where it runs:
// on win32 (`sep` = `\`) a `a\b\c` rel becomes `a/b/c` and splits into three
// components; on posix (`sep` = `/`) that same string is left EXACTLY as it is
// and stays one opaque segment — a backslash is a legal posix filename
// character, so treating it as a separator there would invent components the
// filesystem does not have. Only the trailing-slash strip is cross-platform.
export function toPosix(rel: string): string {
  return rel.split(sep).join('/').replace(/\/+$/, '');
}
