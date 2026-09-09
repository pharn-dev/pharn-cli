import { existsSync, readFileSync } from 'node:fs';
import { writeJsonAtomic } from './atomic-write.js';
import { resolve } from 'node:path';
import { errorMessage, logError } from './report-error.js';
import { isPlainObject } from './validate.js';
import { validateModelRouting, ModelRoutingError } from './model-routing.js';
import { validateSeamConfig, SeamConfigError } from './seam-config.js';
import type { PharnConfig } from '../types.js';

export const CONFIG_FILENAME = 'pharn.config.json';

// The `source` allowlist (src/types.ts, CapabilitySource). The runtime half of
// the type — enum membership, checked at ingest (P0/P5).
const CAPABILITY_SOURCES = ['auto', 'manual'];

/**
 * A `capabilities[].source` that is present but not in the allowlist — the FIRST
 * capabilities-entry check this config has ever had. Named + loud, following the
 * `ModelRoutingError`/`SeamConfigError` pattern, so a hand-edit is reported as
 * the hand-edit it is and never collapsed into the "run `pharn init`" lie.
 *
 * Deliberately narrow (P7): it validates `source` ONLY. `name` and `role` are
 * still passed through unvalidated — hardening those is a separate axis, and
 * widening it here would change what a legacy config is allowed to hold.
 */
export class CapabilitySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilitySourceError';
  }
}

/**
 * Reject a present-but-invalid `capabilities[].source`. ABSENT is legal (P7 —
 * additive: every config written before the field existed omits it), and so is a
 * non-array / non-object shape here, which the existing light shape guard and the
 * consumers already tolerate. Only a present `source` outside the enum throws.
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
 * A `pharn.config.json` that EXISTS but does not parse as JSON — the newest
 * member of this module's named-error family, and the one hand-edit that was
 * left OUT of it.
 *
 * A stray comma used to collapse into the same `null` that means "no file", so
 * every command answered a corrupt config with "No pharn.config.json found. Run
 * `pharn init` first." Both halves of that line were false: the file is right
 * there, and the prescribed remedy DESTROYS it. `init` rewrites this config
 * wholesale — resetting hand-edited `models`/`seam` blocks to defaults and
 * re-stamping every capability `source: 'auto'`, discarding the manual-`add`
 * provenance only this file remembers (`lib/merge-capabilities.ts` reads that
 * field to keep a manual add sticky across `update`). `lib/atomic-write.ts`
 * already describes this exact failure as the reason the config WRITE is atomic;
 * this is the read half of it.
 *
 * Scope is narrow on purpose (P7): only "present but unparseable" moved out of
 * the `null` bucket. Absent, unreadable, and wrong-shape are unchanged.
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
 * V8's `SyntaxError.message` is UNTRUSTED OUTPUT here, not a diagnostic that may
 * be passed through (P2). Measured on node v24.13.1, one of its shapes ECHOES
 * RAW FILE BYTES: a config whose first byte is ESC yields `Unexpected token
 * '\x1b', "\x1b[31mRED" is not valid JSON`. Interpolating that message would
 * turn a hand-editable local file into terminal-escape injection through an
 * error line — the same channel `steps/overwrite-check.ts` already closes by
 * filtering the config's own `skillsVersion` through `VERSION_RE` before
 * printing it.
 *
 * So the message is never interpolated: it is MATCHED, and only the two integers
 * V8 itself computed survive. The `$` anchor is load-bearing, not decoration —
 * the content-echoing shape always ends `" is not valid JSON`, so a config
 * crafted to contain the literal text `(line 999 column 999)` cannot match, and
 * the regex can only ever read the positional suffix V8 appends. If a future V8
 * moves or decorates that suffix the match simply fails and the clause is
 * omitted: the failure mode is "no location", never a location taken from file
 * content (P5 — degrade honestly, never guess).
 */
function parseLocation(err: unknown): string {
  const at = /\(line (\d{1,9}) column (\d{1,9})\)$/.exec(errorMessage(err));
  return at ? ` (line ${at[1]}, column ${at[2]})` : '';
}

// The C0 + DEL + C1 ranges — the same set `validate.ts` REJECTS names over and
// `unknown-capabilities.ts` STRIPS from upstream text. Three copies of one range
// is a smell; single-sourcing it is a separate axis (P3/P7) and is not done here.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * The config path, made safe to PRINT. The filesystem path is untouched — this
 * is a display transform applied at the one place the string enters a message.
 *
 * `configPath(cwd)` is not derived from the config file, but it is not this
 * CLI's own text either: it embeds the process working directory, and a
 * directory name can carry ESC or a newline on POSIX (a hostile archive or repo
 * can create one). That reaches `logError` and, under `list --json`, the
 * `console.error` beside a machine-readable stdout — so raw bytes there mean
 * altered terminal presentation or forged-looking stderr lines.
 *
 * This is the SAME channel `parseLocation` refuses to open for V8's message,
 * with a different source; closing one and not the other would leave the
 * principle half-applied. (Named by a reviewer on the PR that introduced this
 * message — the omission was mine, not the audit's.)
 *
 * ESCAPED, not stripped, and that is the whole design choice. Stripping would
 * print a path that DOES NOT EXIST — actively worse in a message whose entire job
 * is "here is the file to go fix", since the user would look in the wrong place.
 * `\xNN` keeps the path recognisable, byte-recoverable, and inert. Deliberately
 * NOT length-capped either: a cwd is bounded by the OS (PATH_MAX), unlike the
 * multi-megabyte upstream strings `unknown-capabilities.ts` caps, and truncating
 * would again name a path that is not the file.
 */
function displayPath(path: string): string {
  return path.replace(
    CONTROL_CHARS_RE,
    (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

export function configPath(cwd: string): string {
  return resolve(cwd, CONFIG_FILENAME);
}

/**
 * Read + validate pharn.config.json.
 *
 * Returns `null` ONLY for "there is no config to read": an absent file, an
 * UNREADABLE one, or a wrong top-level shape (→ the caller's "run `pharn init`").
 * Every OTHER failure is a present, readable file the user hand-edited into
 * something this CLI will not act on, and each throws its own NAMED error that
 * PROPAGATES rather than collapsing into the "run init" lie: `ConfigParseError`
 * (not JSON at all), and — validated OUTSIDE the null-returning try —
 * `ModelRoutingError`/`SeamConfigError`/`CapabilitySourceError` (BUG 1).
 *
 * The parse split is the point. "File absent" and "file corrupt" used to be the
 * same `null`, so a stray comma was reported as a MISSING file and answered with
 * a command that overwrites it (see `ConfigParseError`). They are now distinct by
 * construction — the branch is `JSON.parse` throwing, not a second `existsSync`
 * guess at a call site.
 *
 * On success the validated, typed `models`/`seam` (the validators' stripped
 * return) replace the raw sub-blocks (BUG 3), while unknown TOP-LEVEL keys still
 * pass through so a legacy config carrying a since-removed field still loads
 * (P7, additive).
 */
export function readPharnConfig(cwd: string): PharnConfig | null {
  const path = configPath(cwd);
  if (!existsSync(path)) return null;
  // The read and the parse are DELIBERATELY separate tries. An unreadable file
  // (EACCES, or a directory planted at this path → EISDIR) keeps the OLD
  // behaviour — `null`, the caller's "run init" — because that is a different,
  // pre-existing failure, and folding it in here would newly mislabel a
  // permissions problem as a syntax error. Narrow on purpose (P7).
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  // Present + readable + not JSON → the named throw. This try does NOT wrap the
  // validators below — that is the whole point (BUG 1).
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ConfigParseError(
      `${displayPath(path)} is not valid JSON${parseLocation(err)}. The file exists — fix its syntax by hand. ` +
        'Do NOT run `pharn init` to clear it: init OVERWRITES this config, discarding your recorded ' +
        'capabilities, any manual `pharn add` provenance, and hand-edited models/seam blocks. If it ' +
        `is beyond repair, move it aside first (\`mv ${CONFIG_FILENAME} ${CONFIG_FILENAME}.bak\`), ` +
        'then run `pharn init`.',
    );
  }
  if (!isPlainObject(raw)) return null;
  // Light shape guard so a hand-edited config fails fast here (→ "run init")
  // rather than throwing deep inside add/update on `config.modules.map`.
  if (typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules)) {
    return null;
  }
  // Present-but-invalid → the validators THROW (named) and the error propagates.
  // Absent models/seam is legacy/valid (P7, additive). Use the validators' typed,
  // stripped return for the sub-blocks (BUG 3).
  const models =
    raw.models !== undefined ? validateModelRouting(raw.models) : undefined;
  const seam =
    raw.seam !== undefined ? validateSeamConfig(raw.seam) : undefined;
  // Same discipline for `capabilities[].source`: a present-but-invalid value
  // throws NAMED here rather than flowing into the merge. Entries are otherwise
  // passed through the spread unreconstructed, so `source` round-trips with no
  // load-mechanics change at all.
  validateCapabilitySources(raw.capabilities);
  const config: PharnConfig = {
    ...(raw as unknown as PharnConfig),
    ...(models !== undefined ? { models } : {}),
    ...(seam !== undefined ? { seam } : {}),
  };
  // Additive `layout` (lib/layout.ts): coerce to the {pharn, flat} enum. A legacy
  // config omits it and a hand-edited garbage value is dropped — both resolve to
  // 'flat' downstream (configLayout), the safe default (P5/P7). Only 'pharn' /
  // 'flat' survive verbatim, so the field round-trips.
  if (config.layout !== 'pharn' && config.layout !== 'flat') {
    delete config.layout;
  }
  return config;
}

/**
 * Load pharn.config.json for a command, or exit(1) with a clear message — the
 * shared load surface for `add`/`status`/`update`/`remove` (mirrors
 * `cancelAndExit` in `lib/confirm.ts`). It distinguishes the two failures the
 * bare `readPharnConfig` collapses:
 * - `null` (absent / unreadable / wrong-shape) → "Run `pharn init`" + exit(1).
 * - a NAMED config error → that loud, offender-naming message + exit(1), NEVER
 *   the "run init" lie (BUG 1). This now includes `ConfigParseError`, so the one
 *   case where "run init" was actively DESTRUCTIVE — a corrupt file that the
 *   prescribed re-init would overwrite — no longer reaches that branch at all.
 * Any OTHER error is a programming bug, not a config problem — it is RETHROWN,
 * never swallowed (so this helper can never re-become the disease it fixes).
 */
export function loadConfigOrExit(cwd: string): PharnConfig {
  try {
    const config = readPharnConfig(cwd);
    if (config) return config;
  } catch (err) {
    if (isConfigValidationError(err)) {
      logError(err.message);
      process.exit(1);
    }
    throw err;
  }
  // Reached only when readPharnConfig returned null (absent / unreadable /
  // wrong-shape). A file that EXISTS but does not parse throws above instead —
  // this line may never again describe a file that is sitting right there.
  logError('No pharn.config.json found. Run `pharn init` first.');
  process.exit(1);
}

/**
 * Is `err` a present-but-invalid-config error — a file that IS there and that
 * the user has to fix (unparseable JSON, a hand-edited `models`/`seam` block, or
 * a `capabilities[].source` outside its enum) — as opposed to a programming bug?
 *
 * The single definition of "config error" — used by `loadConfigOrExit` and by
 * `list`'s own `--json`-aware error path, so neither re-encodes the class
 * membership (P3). Adding a member here is what routes a new failure to the loud,
 * offender-naming message at BOTH call sites with no edit at either: the branch
 * is `instanceof` union membership, never identity against one class.
 */
export function isConfigValidationError(
  err: unknown,
): err is
  | ConfigParseError
  | ModelRoutingError
  | SeamConfigError
  | CapabilitySourceError {
  return (
    err instanceof ConfigParseError ||
    err instanceof ModelRoutingError ||
    err instanceof SeamConfigError ||
    err instanceof CapabilitySourceError
  );
}

/**
 * Write `pharn.config.json`. ATOMIC (lib/atomic-write.ts): a torn write would
 * leave truncated JSON on disk — which every command must then answer for. That
 * answer is now `ConfigParseError`, naming the file and the syntax position and
 * warning AGAINST the re-init that would overwrite it; it used to be "No
 * pharn.config.json found. Run `pharn init` first.", which reported the file as
 * ABSENT and prescribed exactly the re-init that resets hand-edited
 * `models`/`seam` blocks and re-stamps every capability `source: 'auto'`, losing
 * the manual-add provenance only this file remembers. Atomicity is what keeps
 * that state unreachable in the first place; the named error is what makes it
 * survivable if it is ever reached another way. Bytes are unchanged.
 */
export async function writePharnConfig(
  cwd: string,
  config: PharnConfig,
): Promise<void> {
  await writeJsonAtomic(configPath(cwd), config);
}

/**
 * Is this an archetype (capability) install vs. a legacy module install?
 * Deterministic membership (P5): the archetype install (`pharn init --archetype`)
 * always writes a `capabilities` array; a legacy module config never does — so
 * the presence of `capabilities` is the marker. An empty `modules: []` alone is
 * NOT the marker (a module install can legitimately resolve to few modules).
 * Sibling commands branch on this to avoid the module/manifest path (which fails
 * against live pharn-oss, having no manifest.json) for archetype installs.
 */
export function isArchetypeConfig(config: PharnConfig): boolean {
  return Array.isArray(config.capabilities);
}

// The single message shown when a command runs against a pre-archetype (module)
// config, which is no longer operable: the module/manifest install path was
// removed (live pharn-oss ships no manifest.json), so add/update/status/remove
// cannot resolve it. `list` emits this json-aware (to stderr in --json); the
// other four go through loadArchetypeConfigOrExit. Deterministic (P5): the branch
// is the isArchetypeConfig membership test and its terminal is this named
// hard-fail, never a guess or a silent proceed (P6).
export const LEGACY_CONFIG_MESSAGE =
  'This project uses the legacy module layout (pre-archetype), which is no longer supported. Re-run `pharn init` to reinstall with the archetype/capability model.';

/**
 * Load pharn.config.json and require it be an archetype (capability) install, or
 * exit(1) with the single `LEGACY_CONFIG_MESSAGE`. The shared load surface for
 * `add`/`update`/`status`/`remove` after the module/manifest path was removed —
 * it single-sources the legacy reject (P3, no 5× copy). `list` keeps its own
 * json-aware check because its error must stay on stderr in `--json`.
 */
export function loadArchetypeConfigOrExit(cwd: string): PharnConfig {
  const config = loadConfigOrExit(cwd);
  if (!isArchetypeConfig(config)) {
    logError(LEGACY_CONFIG_MESSAGE);
    process.exit(1);
  }
  return config;
}
