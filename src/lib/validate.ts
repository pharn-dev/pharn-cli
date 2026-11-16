import { dirname, resolve, sep } from 'node:path';
import { escapeUnsafe, hasUnsafeChars } from './terminal-safe.js';

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// Capability directory basename: lowercase alnum words joined by single hyphens
// (`a11y`, `n-plus-one`). Every name read from the fetched tree is checked
// against it before any path-join; it admits no `.`, so no `..`.
export const CAPABILITY_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A product command / hook filename copied from the fetched tree.
export const COPY_FILENAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.(md|cjs|mjs|json)$/;
// A full commit SHA (40 lowercase hex). A network-derived sha is checked
// against it before it becomes a codeload URL segment or the recorded `commit`.
export const COMMIT_RE = /^[0-9a-f]{40}$/;
// A pharn-oss RELEASE tag — `v` + a plain three-part version (a verified
// release is never a prerelease). Checked before `tag_name` becomes a URL
// segment, is displayed, or is compared with SKILLS_VERSION. Anchored.
export const RELEASE_TAG_RE = /^v(\d+\.\d+\.\d+)$/;
// Capability `role` enum — the two installable kinds.
export const ROLE_VALUES = ['griller', 'lens'] as const;
// The project archetypes — the ONE runtime list (`Archetype` derives from it);
// its order is detection's output order.
export const ARCHETYPE_VALUES = ['ssr', 'backend', 'spa', 'lib'] as const;
// Capability `applies` tokens: `universal` (always selected) or an archetype.
export const APPLIES_TOKEN_VALUES = ['universal', ...ARCHETYPE_VALUES] as const;
/**
 * Assert a fetched capability `role` is an installable kind; hard-fail
 * otherwise. `label` names the capability in the error.
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

/** Assert a single fetched `applies` token is a known enum value. */
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
  // The unsafe-character reject runs first, so neither message quotes such a
  // character. Both are escaped whole because the LABEL is not ours either:
  // call sites interpolate the untrusted name into it.
  if (hasUnsafeChars(value)) {
    throw new ManifestValidationError(
      escapeUnsafe(`${label} contains control characters`),
    );
  }
  if (!pattern.test(value)) {
    throw new ManifestValidationError(
      escapeUnsafe(`${label} has invalid format: ${JSON.stringify(value)}`),
    );
  }
  return value;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// The LEXICAL path-containment gate (resolve + startsWith): nothing joined
// through it escapes `base`. It does NOT resolve symlinks — the physical check
// is lib/symlink-guard.ts.
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

// The STRICT-child form of safeJoin, for a destructive op addressed by one
// name: always exactly one segment below `base` — never `base` itself (which
// safeJoin allows) and never a grandchild. Lexical, like safeJoin.
export function safeChildJoin(base: string, name: string): string {
  const root = resolve(base);
  const target = resolve(root, name);
  if (target === root || dirname(target) !== root) {
    throw new ManifestValidationError(
      `Refusing path: ${JSON.stringify(name)} is not a single directory entry directly under ${base}`,
    );
  }
  return target;
}

// Normalize a rel to a posix, no-trailing-slash key. Purely LEXICAL. It
// converts the PLATFORM separator: on win32 `a\b\c` becomes `a/b/c`; on posix
// a backslash is a legal filename character and stays one opaque segment.
// Only the trailing-slash strip is cross-platform.
export function toPosix(rel: string): string {
  return rel.split(sep).join('/').replace(/\/+$/, '');
}
