import { createHash } from 'node:crypto';
import { writeJsonAtomic } from './atomic-write.js';
import { readBoundedFile, readJsonBounded } from './bounded-read.js';
import { resolve } from 'node:path';
import { CliError, errorMessage } from './cli-error.js';
import { escapeUnsafe, terminalSafe } from './terminal-safe.js';
import {
  ARCHETYPE_VALUES,
  assertSafeString,
  CAPABILITY_NAME_RE,
  COMMIT_RE,
  isPlainObject,
  ROLE_VALUES,
  VERSION_RE,
} from './validate.js';
import type { PharnConfig } from '../types.js';

export const CONFIG_FILENAME = 'pharn.config.json';

// The `source` allowlist (src/types.ts, CapabilitySource), checked at ingest.
const CAPABILITY_SOURCES = ['auto', 'manual'];

/**
 * A present `capabilities[].source` outside the allowlist — named, so a
 * hand-edit is reported as one and never collapsed into "run `pharn init`".
 */
export class CapabilitySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilitySourceError';
  }
}

/**
 * A `capabilities[]` entry whose `name` or `role` this CLI could never have
 * written. The config is committed and hand-editable, and `name` is path-joined
 * by `remove`'s recursive delete, so it is validated at ingest.
 */
export class CapabilityEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityEntryError';
  }
}

/**
 * Reject a non-object entry, a `name` outside `CAPABILITY_NAME_RE`, a `role`
 * outside `ROLE_VALUES`, and a PRESENT `capabilities` that is not an array.
 * Absent is the pre-archetype config; a non-array is a hand-edit, and reading
 * it as legacy would prescribe `pharn init`, which overwrites the config.
 */
function validateCapabilityEntries(raw: unknown): void {
  if (raw === undefined) return;
  if (!Array.isArray(raw)) {
    throw new CapabilityEntryError(
      `${CONFIG_FILENAME}: capabilities must be an array of {"name", "role"} entries (found ${describeOffender(raw)}). ` +
        'Fix it by hand — do NOT run `pharn init` to clear it: init overwrites this config.',
    );
  }
  raw.forEach((entry, i) => {
    const at = `${CONFIG_FILENAME}: capabilities[${i}]`;
    if (!isPlainObject(entry)) {
      throw new CapabilityEntryError(
        `${at} must be an object with "name" and "role" (found ${JSON.stringify(entry)}). Fix it by hand.`,
      );
    }
    try {
      assertSafeString(entry.name, `${at}.name`, CAPABILITY_NAME_RE);
    } catch (err) {
      throw new CapabilityEntryError(
        `${errorMessage(err)}. A capability name is one lowercase, hyphen-separated segment (e.g. "a11y", "n-plus-one"). Fix it by hand.`,
      );
    }
    if (!ROLE_VALUES.some((r) => r === entry.role)) {
      throw new CapabilityEntryError(
        `${at}.role must be ${ROLE_VALUES.map((r) => `"${r}"`).join(' or ')} (found ${JSON.stringify(entry.role)}). Fix it by hand.`,
      );
    }
  });
}

/**
 * Reject a present-but-invalid `capabilities[].source`; ABSENT is legal (configs
 * written before the field existed omit it). Runs after
 * `validateCapabilityEntries`.
 */
function validateCapabilitySources(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  raw.forEach((entry, i) => {
    if (!isPlainObject(entry)) return;
    if (!('source' in entry)) return;
    const source = entry.source;
    if (typeof source !== 'string' || !CAPABILITY_SOURCES.includes(source)) {
      throw new CapabilitySourceError(
        `${CONFIG_FILENAME}: capabilities[${i}].source must be ${CAPABILITY_SOURCES.map(
          (s) => `"${s}"`,
        ).join(' or ')} (found ${JSON.stringify(source)}). ` +
          'Fix it by hand, or delete the field — an absent `source` is valid and the next `pharn update` will set it.',
      );
    }
  });
}

/**
 * An archetype config's `archetypes` that is not an array of `ARCHETYPE_VALUES`.
 * It drives selection and is printed by `list`/`status`/`update`. Absent, `[]`
 * and duplicates stay legal (selection is set membership).
 */
export class ArchetypesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchetypesError';
  }
}

// The offending value, safe to print: JSON-quoted, unsafe characters as `\u`
// escapes (lossless), capped so a huge hand-edit is not echoed whole.
function describeOffender(value: unknown): string {
  return terminalSafe(escapeUnsafe(JSON.stringify(value) ?? String(value)), {
    max: 80,
  });
}

/**
 * Reject an archetype config's present-but-invalid `archetypes`. Only called for
 * an archetype config; a pre-archetype config's unused fields keep loading.
 */
function validateArchetypes(raw: unknown): void {
  if (raw === undefined) return;
  const allowed = ARCHETYPE_VALUES.map((a) => `"${a}"`).join(', ');
  if (!Array.isArray(raw)) {
    throw new ArchetypesError(
      `${CONFIG_FILENAME}: archetypes must be an array of ${allowed} (found ${describeOffender(raw)}). ` +
        'Fix it by hand (e.g. ["ssr"]).',
    );
  }
  raw.forEach((entry: unknown, i) => {
    if (!ARCHETYPE_VALUES.some((a) => a === entry)) {
      throw new ArchetypesError(
        `${CONFIG_FILENAME}: archetypes[${i}] must be one of ${allowed} (found ${describeOffender(entry)}). Fix it by hand.`,
      );
    }
  });
}

/**
 * An archetype config's install stamp — `skillsVersion` (`VERSION_RE`) or
 * `commit` (`COMMIT_RE` or `null`) — that this CLI could never have written.
 * Both are printed and compared (`update`'s ahead-of check, `add`'s version gate).
 * An absent `commit` is legal and read as `null`; a pre-archetype config is not
 * checked.
 */
export class ConfigStampError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigStampError';
  }
}

// `typeof skillsVersion === 'string'` is already the light shape guard's
// (→ `null`); this is the archetype config's allowlist on top of it.
function validateStamp(raw: Record<string, unknown>): void {
  const where =
    'Fix it by hand — `pharn.records.json`, if present, carries the same stamp.';
  if (
    typeof raw.skillsVersion === 'string' &&
    !VERSION_RE.test(raw.skillsVersion)
  ) {
    throw new ConfigStampError(
      `${CONFIG_FILENAME}: skillsVersion must be a version like "1.2.3" (found ${describeOffender(raw.skillsVersion)}). ${where}`,
    );
  }
  if (
    raw.commit !== undefined &&
    raw.commit !== null &&
    (typeof raw.commit !== 'string' || !COMMIT_RE.test(raw.commit))
  ) {
    throw new ConfigStampError(
      `${CONFIG_FILENAME}: commit must be a full 40-character lowercase hex commit SHA, or null (found ${describeOffender(raw.commit)}). ${where}`,
    );
  }
}

/**
 * A `pharn.config.json` that EXISTS but does not parse as JSON. Kept apart from
 * the `null` ("no config") answer because that answer prescribes `pharn init`,
 * which rewrites the file wholesale — resetting a hand-edited `models` block and
 * the manual-`add` provenance only this file remembers.
 */
export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * The ` (line N, column M)` clause for a `JSON.parse` failure — or `''`.
 *
 * V8's message is untrusted output: one of its shapes echoes raw file bytes (an
 * ESC byte included), so it is never interpolated. Only the two integers of the
 * positional suffix survive; the `$` anchor keeps file content that merely
 * contains `(line 999 column 999)` from matching. A changed V8 format yields no
 * location, never one taken from file content.
 */
function parseLocation(err: unknown): string {
  const at = /\(line (\d{1,9}) column (\d{1,9})\)$/.exec(errorMessage(err));
  return at ? ` (line ${at[1]}, column ${at[2]})` : '';
}

/**
 * The config path, made safe to PRINT (the filesystem path is untouched). It
 * embeds the cwd, and a directory name can carry ESC or a newline. ESCAPED via
 * `escapeUnsafe`, not stripped or capped: the message's job is to name the file
 * to fix, and a stripped or truncated path would name one that does not exist.
 */
function displayPath(path: string): string {
  return escapeUnsafe(path);
}

export function configPath(cwd: string): string {
  return resolve(cwd, CONFIG_FILENAME);
}

/**
 * Every top-level key this CLI OWNS: exactly the keys `PharnConfig` declares.
 * `models` is pharn's to WRITE but pharn-oss's to define, so a re-run init
 * replaces it rather than carrying a stale one. The one declared key NOT here is
 * `seam`: pharn-oss owns it, so it is carried like any user key.
 *
 * The `satisfies` clause makes the list exhaustive by construction, so a new
 * pharn-owned field can never be read as the user's. A `Set`, never an `in`
 * test: `in` walks the prototype chain (`constructor`, `toString`).
 */
const CLI_OWNED_KEYS: ReadonlySet<string> = new Set(
  Object.keys({
    pharnVersion: true,
    skillsVersion: true,
    pendingSkillsVersion: true,
    frozenCapabilities: true,
    repo: true,
    commit: true,
    ref: true,
    constitution: true,
    isMultiTenant: true,
    modules: true,
    installedAt: true,
    updatedAt: true,
    models: true,
    stackAnswers: true,
    installedSkills: true,
    archetypes: true,
    capabilities: true,
    layout: true,
  } satisfies Record<Exclude<keyof PharnConfig, 'seam'>, true>),
);

/**
 * The top-level entries this CLI does NOT own (`CLI_OWNED_KEYS`) — mostly keys
 * upstream pharn-oss reads (`testResults`, `ship`, `gates`, `budget`). Returned
 * verbatim, never validated. `pharn init` carries them across a re-install.
 *
 * EVERY such key, not an allowlist: `add`/`update`/`remove` already write
 * unknown keys back, upstream adds keys faster than CLI releases, and the owned
 * side is the closed set to enumerate. Cost: a typo key survives a re-init too.
 *
 * `Object.fromEntries` defines own data properties, so a `__proto__` key stays a
 * key and never becomes a prototype.
 */
export function userOwnedConfigEntries(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => !CLI_OWNED_KEYS.has(key)),
  );
}

/**
 * Read + validate pharn.config.json.
 *
 * Returns `null` ONLY when there is no config to read: absent, unreadable, or a
 * wrong top-level shape (→ the caller's "run `pharn init`"). A present, readable
 * file hand-edited into something invalid throws a NAMED error instead
 * (`ConfigParseError`, `CapabilityEntryError`, `CapabilitySourceError`,
 * `ArchetypesError`, `ConfigStampError`), so it is never reported as missing.
 *
 * `models` and `seam` are pharn-oss's and are NOT validated: they ride the
 * spread verbatim, so a block pharn-oss accepts (or the pre-0.7.0 `models`
 * format `update` migrates) never stops a command. Unknown top-level keys pass
 * through too, so legacy fields load and user keys survive every write-back.
 */
export function readPharnConfig(cwd: string): PharnConfig | null {
  const path = configPath(cwd);
  // An unreadable file (EACCES, a directory, a FIFO — bounded-read, so nothing
  // hangs) stays `null`: a permissions problem is not a syntax error.
  const read = readJsonBounded(path);
  if (read.kind === 'absent' || read.kind === 'unusable') return null;
  // Present + readable + not JSON → the named throw. Only the parse is caught,
  // never the validators below.
  if (read.kind === 'invalid-json') {
    throw new ConfigParseError(
      `${displayPath(path)} is not valid JSON${parseLocation(read.error)}. The file exists — fix its syntax by hand. ` +
        'Do NOT run `pharn init` to clear it: init OVERWRITES this config, discarding your recorded ' +
        'capabilities, any manual `pharn add` provenance, and a hand-edited models block. If it ' +
        `is beyond repair, move it aside first (\`mv ${CONFIG_FILENAME} ${CONFIG_FILENAME}.bak\`), ` +
        'then run `pharn init`.',
    );
  }
  const raw = read.value;
  if (!isPlainObject(raw)) return null;
  // Light shape guard (→ "run init"): a string `skillsVersion`, and EITHER a
  // `modules` array (a pre-archetype config, so it still reaches
  // LEGACY_CONFIG_MESSAGE) OR a `capabilities` key of any value (an archetype
  // config; a non-array one reaches validateCapabilityEntries' named error).
  // `init` still WRITES `modules: []` (see `PharnConfig.modules`).
  if (
    typeof raw.skillsVersion !== 'string' ||
    (!Array.isArray(raw.modules) && raw.capabilities === undefined)
  ) {
    return null;
  }
  // `models` and `seam` ride the spread untouched. Entries are not
  // reconstructed, so `source` round-trips.
  validateCapabilityEntries(raw.capabilities);
  validateCapabilitySources(raw.capabilities);
  // `archetypes` and the stamp are checked for an archetype config only.
  if (Array.isArray(raw.capabilities)) {
    validateArchetypes(raw.archetypes);
    validateStamp(raw);
  }
  const config: PharnConfig = { ...(raw as unknown as PharnConfig) };
  // An archetype config with no `commit` reads as `null`, so a write never
  // stamps `undefined` (which drops the key). A legacy config is left as is.
  if (Array.isArray(raw.capabilities) && raw.commit === undefined) {
    config.commit = null;
  }
  // `layout`: only 'pharn' / 'flat' survive; anything else is dropped and
  // resolves to 'flat' downstream (configLayout).
  if (config.layout !== 'pharn' && config.layout !== 'flat') {
    delete config.layout;
  }
  // `ref`: only the literal `"latest"` survives; anything else is dropped, so
  // the install follows `main`, as one with no `ref` does.
  if (config.ref !== undefined && config.ref !== 'latest') {
    delete config.ref;
  }
  // `pendingSkillsVersion`: only a VERSION_RE string survives, so a garbage
  // value fails closed (`add`'s gate compares against `skillsVersion` alone).
  if (
    config.pendingSkillsVersion !== undefined &&
    (typeof config.pendingSkillsVersion !== 'string' ||
      !VERSION_RE.test(config.pendingSkillsVersion))
  ) {
    delete config.pendingSkillsVersion;
  }
  // `frozenCapabilities`: kept only when EVERY element is a valid `role:name`;
  // otherwise the whole field is dropped, as if no capability had been kept.
  if (
    config.frozenCapabilities !== undefined &&
    !isFrozenKeyList(config.frozenCapabilities)
  ) {
    delete config.frozenCapabilities;
  }
  return config;
}

function isFrozenKeyList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((key) => {
      if (typeof key !== 'string') return false;
      const sep = key.indexOf(':');
      if (sep === -1) return false;
      const role = key.slice(0, sep);
      const name = key.slice(sep + 1);
      return (
        ROLE_VALUES.some((r) => r === role) && CAPABILITY_NAME_RE.test(name)
      );
    })
  );
}

/**
 * Load pharn.config.json for a command, or throw a CliError (one error line,
 * exit 1): `null` → "Run `pharn init`"; a named config error → its own
 * message, never "run init". Under `opts.json` the line is plain stderr (no
 * clack chrome), so a JSON reader on stdout stays clean. Any other error is a
 * bug and is rethrown.
 */
export function loadConfig(
  cwd: string,
  opts: { json?: boolean } = {},
): PharnConfig {
  const fail = (message: string): never => {
    throw CliError.error(message, opts);
  };
  try {
    const config = readPharnConfig(cwd);
    if (config) return config;
  } catch (err) {
    if (isConfigValidationError(err)) fail(err.message);
    throw err;
  }
  // Only for a `null` read; a file that exists but does not parse threw above.
  return fail('No pharn.config.json found. Run `pharn init` first.');
}

/**
 * What `pharn.config.json` is on disk right now: `absent`,
 * `unreadable:<errno code>`, or `sha256:<hex>` of the raw bytes. Never throws.
 * Every state a command may have read (absent, corrupt, unreadable — `init`
 * reads the config it replaces tolerantly) is comparable. Raw bytes on
 * purpose: any byte change means someone else wrote it.
 */
export function configFingerprint(cwd: string): string {
  const read = readBoundedFile(configPath(cwd));
  if (read.kind === 'absent') return 'absent';
  if (read.kind === 'unusable') return `unreadable:${read.code}`;
  return `sha256:${createHash('sha256').update(read.bytes).digest('hex')}`;
}

/**
 * The one check every writer makes after its last prompt and before its first
 * write: `pharn.config.json` still has the bytes it had when the command read
 * it under the lock. The lock keeps other pharn writers out, so a change here
 * is a hand-edit or another program; writing the command's config over it
 * would lose that edit. Take `fingerprint` BEFORE the read it guards, so a
 * change between the two fails closed. Throws a CliError refusal.
 */
export function assertConfigFingerprintUnchanged(
  cwd: string,
  fingerprint: string,
  command: string,
): void {
  if (configFingerprint(cwd) === fingerprint) return;
  throw CliError.refusal(
    `${CONFIG_FILENAME} changed while \`pharn ${command}\` was running — it was edited by hand or by another program while the command waited for your answer. Nothing was written. Re-run \`pharn ${command}\` to act on the current state.`,
  );
}

/**
 * Is `err` a present-but-invalid-config error (one the user must fix by hand)
 * rather than a programming bug? `models` and `seam` never produce one. The one
 * definition, shared by `loadConfig` and `list`'s `--json` path.
 */
export function isConfigValidationError(
  err: unknown,
): err is
  | ConfigParseError
  | CapabilityEntryError
  | CapabilitySourceError
  | ArchetypesError
  | ConfigStampError {
  return (
    err instanceof ConfigParseError ||
    err instanceof CapabilityEntryError ||
    err instanceof CapabilitySourceError ||
    err instanceof ArchetypesError ||
    err instanceof ConfigStampError
  );
}

/**
 * Write `pharn.config.json` ATOMICALLY (lib/atomic-write.ts): a torn write
 * would leave truncated JSON on disk.
 */
export async function writePharnConfig(
  cwd: string,
  config: PharnConfig,
): Promise<void> {
  await writeJsonAtomic(configPath(cwd), config);
}

/**
 * Is this an archetype (capability) install? `init` always writes a
 * `capabilities` array and a legacy module config never does, so its presence
 * is the marker (a present non-array is refused at load). `modules: []` alone
 * is not.
 */
export function isArchetypeConfig(config: PharnConfig): boolean {
  return Array.isArray(config.capabilities);
}

// Shown when a command runs against a pre-archetype (module) config, which no
// command can operate on any more (live pharn-oss ships no manifest.json).
export const LEGACY_CONFIG_MESSAGE =
  'This project uses the legacy module layout (pre-archetype), which is no longer supported. Re-run `pharn init` to reinstall with the archetype/capability model.';

/**
 * Load pharn.config.json and require an archetype install, or throw a CliError
 * (exit 1) with `LEGACY_CONFIG_MESSAGE` — or `loadConfig`'s own.
 * `opts.json` keeps every error a plain stderr line.
 */
export function loadArchetypeConfig(
  cwd: string,
  opts: { json?: boolean } = {},
): PharnConfig {
  const config = loadConfig(cwd, opts);
  if (!isArchetypeConfig(config)) {
    throw CliError.error(LEGACY_CONFIG_MESSAGE, opts);
  }
  return config;
}
