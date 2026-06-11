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
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/;

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
