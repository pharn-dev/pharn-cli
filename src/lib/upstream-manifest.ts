import { lstatSync } from 'node:fs';
import { readJsonBounded } from './bounded-read.js';
import { CLAUDE_SETTINGS_FILE, PHARN_CONTRACTS_DIR } from './constants.js';
import { matchesRawSha256 } from './hash.js';
import { isPharnOwnedPath } from './install-surfaces.js';
import { capabilitySubtree, detectLayout, layoutPaths } from './layout.js';
import { readSkillsVersion } from './skills-version.js';
import { escapeUnsafe } from './terminal-safe.js';
import {
  assertAppliesToken,
  assertRole,
  assertSafeString,
  CAPABILITY_NAME_RE,
  isPlainObject,
  ManifestValidationError,
  safeJoin,
  VERSION_RE,
} from './validate.js';
import type {
  Archetype,
  CapabilityEntry,
  CapabilityIndex,
  InstalledCapability,
  UnknownCapability,
} from '../types.js';

// ---------------------------------------------------------------------------
// pharn-install.json — the install manifest pharn-oss declares (from SKILLS
// 7.20.0; schema: pharn-oss docs/install-manifest.md). When a fetched tree
// carries one, the install set, the capability index, the settings copy and
// the `models` defaults come from it instead of the CLI's own derivation.
//
// Trust: it arrives in the same tarball, at the same tag-resolved commit, as
// the files it describes — provenance, not authentication. So it is DATA:
// parsed as JSON through the bounded reader, validated field by field against
// the CLI's own allowlists, never executed. Every `path` and `dest` is
// safeJoin-contained, every `dest` must lie inside the CLI-owned outer bound
// (isPharnOwnedPath — never the manifest's own `installRoots`), and fetchRepo
// verifies each file's RAW sha256 right after extraction, before any command
// can read the tree, so a mismatch refuses with nothing written.
//
// ONE parser: readUpstreamManifest is the only reader. verifyUpstreamManifest
// takes its result, and every branch point re-reads through it, so there is no
// second validation path. Present but unusable, invalid or of an unknown
// `schemaVersion` → refuse (never fall back to the derivation). Absent → null:
// the caller derives as before, a fallback removed in v0.22.0 (CORE-186).
// ---------------------------------------------------------------------------

export const MANIFEST_FILE = 'pharn-install.json';
export const MANIFEST_SCHEMA_VERSION = 1;
// pharn-oss 7.20.0's file is about 180 KB.
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
// The extractor's own entry cap: a tree cannot hold more files than this.
export const MAX_MANIFEST_FILES = 20_000;

const POLICIES = ['managed', 'if-absent'] as const;
type Policy = (typeof POLICIES)[number];
const CAPABILITY_SURFACE = 'capability';

// A project- or tree-relative path: `/`-separated segments of the portable
// filename set, none empty, `.` or `..`, no leading `/`, no backslash.
const MANIFEST_PATH_RE =
  /^(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
// A surface name: a token, never a closed enum, so a surface upstream adds is
// installed (its `dest` is still held to the outer bound).
const SURFACE_RE = /^[a-z][a-z0-9-]*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

/** A manifest refusal: the tree is not installed and nothing is written. */
export class UpstreamManifestError extends ManifestValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamManifestError';
  }
}

export interface ManifestFile {
  path: string;
  dest: string;
  surface: string;
  // The owning capability's name, on `capability` files only.
  capability?: string;
  policy: Policy;
  sha256: string;
}

export interface ManifestCapability {
  name: string;
  role: InstalledCapability['role'];
  // `'universal'` or the raw tokens; each token is judged by the index
  // (an unknown one makes the capability `unknown`, never a refusal).
  applies: 'universal' | string[];
  dir: string;
}

export interface UpstreamManifest {
  skillsVersion: string;
  capabilities: ManifestCapability[];
  files: ManifestFile[];
  // `models.defaults`, unchecked here: lib/upstream-models.ts holds it to the
  // pinned checker before it can reach a config write. `undefined` = absent.
  modelsDefaults: unknown;
}

function refuse(detail: string): UpstreamManifestError {
  return new UpstreamManifestError(
    `pharn-oss's ${MANIFEST_FILE} ${escapeUnsafe(detail)}; refusing to install. Nothing was written.`,
  );
}

const show = (v: unknown): string => JSON.stringify(v) ?? String(v);

/**
 * Read and validate the tree's pharn-install.json, or `null` when the tree has
 * none. Throws UpstreamManifestError for anything else.
 */
export function readUpstreamManifest(repoDir: string): UpstreamManifest | null {
  const read = readJsonBounded(
    safeJoin(repoDir, MANIFEST_FILE),
    MAX_MANIFEST_BYTES,
  );
  if (read.kind === 'absent') return null;
  if (read.kind === 'unusable') throw refuse(read.reason);
  // V8's message is not echoed: one of its shapes quotes raw file bytes.
  if (read.kind === 'invalid-json') throw refuse('is not valid JSON');
  const raw = read.value;
  if (!isPlainObject(raw)) throw refuse('is not a JSON object');
  if (raw.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new UpstreamManifestError(
      `pharn-oss's ${MANIFEST_FILE} declares schemaVersion ${escapeUnsafe(show(raw.schemaVersion))}, and this pharn reads only schemaVersion ${MANIFEST_SCHEMA_VERSION}. Upgrade pharn (\`npm install -g @pharn-dev/pharn@latest\`, or run \`npx @pharn-dev/pharn@latest\`) and re-run; with \`--ref main\`, the tip may be ahead of the latest release. Nothing was written.`,
    );
  }
  const skillsVersion = checkSkillsVersion(repoDir, raw.skillsVersion);
  checkLayout(repoDir, raw.layout);
  const capabilities = checkCapabilities(raw.capabilities);
  const files = checkFiles(repoDir, raw.files, capabilities);
  const modelsDefaults = checkModels(raw.models);
  checkInstallRoots(raw.installRoots);
  return { skillsVersion, capabilities, files, modelsDefaults };
}

function checkSkillsVersion(repoDir: string, value: unknown): string {
  if (typeof value !== 'string' || !VERSION_RE.test(value)) {
    throw refuse(`has an invalid skillsVersion ${show(value)}`);
  }
  const tree = readSkillsVersion(repoDir);
  if (value !== tree) {
    throw refuse(
      `declares skillsVersion ${value}, but the tree's SKILLS_VERSION is ${tree}`,
    );
  }
  return value;
}

// The only layout a manifest may declare is the one this CLI knows as `pharn`,
// with its own marker and capability subtrees, and the tree must be it.
function checkLayout(repoDir: string, layout: unknown): void {
  const pharn = layoutPaths('pharn');
  const subtrees = isPlainObject(layout) ? layout.capabilitySubtrees : null;
  const known =
    isPlainObject(layout) &&
    layout.name === 'pharn' &&
    layout.marker === PHARN_CONTRACTS_DIR &&
    isPlainObject(subtrees) &&
    subtrees.griller === pharn.grillers &&
    subtrees.lens === pharn.lenses &&
    Object.keys(subtrees).length === 2;
  if (!known) {
    throw new UpstreamManifestError(
      `pharn-oss's ${MANIFEST_FILE} declares a layout this pharn does not know (${escapeUnsafe(show(layout))}). Upgrade pharn (\`npm install -g @pharn-dev/pharn@latest\`) and re-run. Nothing was written.`,
    );
  }
  if (detectLayout(repoDir) !== 'pharn') {
    throw refuse(
      `declares the pharn layout, but the tree has no ${PHARN_CONTRACTS_DIR}`,
    );
  }
}

function checkCapabilities(value: unknown): ManifestCapability[] {
  if (!Array.isArray(value)) throw refuse('has no capabilities array');
  const pharn = layoutPaths('pharn');
  const names = new Set<string>();
  return value.map((entry: unknown, i): ManifestCapability => {
    const at = `capabilities[${i}]`;
    if (!isPlainObject(entry)) throw refuse(`${at} is not an object`);
    const name = guard(() =>
      assertSafeString(entry.name, `${at} name`, CAPABILITY_NAME_RE),
    );
    const role = guard(() => assertRole(entry.role, `${at} (${name})`));
    if (names.has(name)) throw refuse(`declares capability "${name}" twice`);
    names.add(name);
    const dir = `${capabilitySubtree(pharn, role)}/${name}`;
    if (entry.dir !== dir) {
      throw refuse(
        `${at} (${name}) has dir ${show(entry.dir)}; a ${role} lives at ${dir}`,
      );
    }
    return { name, role, applies: checkApplies(entry.applies, at), dir };
  });
}

// The SHAPE only: `'universal'`, or a non-empty array of strings. Whether each
// token is an archetype this CLI knows is the index's call (manifestIndex).
function checkApplies(value: unknown, at: string): 'universal' | string[] {
  if (value === 'universal') return value;
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((t) => typeof t === 'string')
  ) {
    return [...(value as string[])];
  }
  throw refuse(`${at} has a malformed applies ${show(value)}`);
}

function checkFiles(
  repoDir: string,
  value: unknown,
  capabilities: readonly ManifestCapability[],
): ManifestFile[] {
  if (!Array.isArray(value)) throw refuse('has no files array');
  if (value.length > MAX_MANIFEST_FILES) {
    throw refuse(`declares more than ${MAX_MANIFEST_FILES} files`);
  }
  const byName = new Map(capabilities.map((c) => [c.name, c]));
  const owned = new Set<string>();
  const dests = new Set<string>();
  const files = value.map((entry: unknown, i): ManifestFile => {
    const at = `files[${i}]`;
    if (!isPlainObject(entry)) throw refuse(`${at} is not an object`);
    const path = checkPath(repoDir, entry.path, `${at} path`);
    const dest = checkPath(repoDir, entry.dest, `${at} dest`);
    if (dests.has(dest)) throw refuse(`declares the dest ${dest} twice`);
    dests.add(dest);
    if (typeof entry.sha256 !== 'string' || !SHA256_RE.test(entry.sha256)) {
      throw refuse(`${at} (${dest}) has a malformed sha256`);
    }
    const policy = POLICIES.find((p) => p === entry.policy);
    if (policy === undefined) {
      throw refuse(
        `${at} (${dest}) has an unknown policy ${show(entry.policy)}`,
      );
    }
    if (typeof entry.surface !== 'string' || !SURFACE_RE.test(entry.surface)) {
      throw refuse(
        `${at} (${dest}) has a malformed surface ${show(entry.surface)}`,
      );
    }
    checkDestBound(dest, path, policy, at);
    const file: ManifestFile = {
      path,
      dest,
      surface: entry.surface,
      policy,
      sha256: entry.sha256,
    };
    if (entry.surface === CAPABILITY_SURFACE) {
      const cap = byName.get(entry.capability as string);
      if (typeof entry.capability !== 'string' || cap === undefined) {
        throw refuse(
          `${at} (${dest}) names no declared capability (${show(entry.capability)})`,
        );
      }
      if (path !== dest || !dest.startsWith(`${cap.dir}/`)) {
        throw refuse(`${at} (${dest}) does not lie inside ${cap.dir}`);
      }
      owned.add(cap.name);
      file.capability = cap.name;
    } else if (entry.capability !== undefined) {
      throw refuse(
        `${at} (${dest}) names a capability outside the capability surface`,
      );
    }
    return file;
  });
  for (const cap of capabilities) {
    if (!owned.has(cap.name)) {
      throw refuse(`declares capability "${cap.name}" with no files`);
    }
  }
  return files;
}

function checkPath(repoDir: string, value: unknown, at: string): string {
  if (typeof value !== 'string' || !MANIFEST_PATH_RE.test(value)) {
    throw refuse(`${at} ${show(value)} is not a safe relative path`);
  }
  guard(() => safeJoin(repoDir, value));
  return value;
}

// The CLI-owned outer bound (lib/install-surfaces.ts): `.claude/settings.json`
// only as if-absent from the same path, every other dest pharn-owned. A dest
// outside it is an anomaly, not a new surface, so the whole manifest refuses.
function checkDestBound(
  dest: string,
  path: string,
  policy: Policy,
  at: string,
): void {
  if (dest === CLAUDE_SETTINGS_FILE || policy === 'if-absent') {
    if (
      dest === CLAUDE_SETTINGS_FILE &&
      path === dest &&
      policy === 'if-absent'
    )
      return;
    throw refuse(
      `${at} (${dest}): only ${CLAUDE_SETTINGS_FILE} may be copied if absent, and only from the same path`,
    );
  }
  if (!isPharnOwnedPath(dest)) {
    throw refuse(`${at} would write ${dest}, outside the paths pharn installs`);
  }
}

// `defaults` is checked later, by the pinned checker (lib/upstream-models.ts).
// `rules` is read by no code here: lib/model-config.ts stays the one validator.
function checkModels(value: unknown): unknown {
  if (!isPlainObject(value)) throw refuse('has no models object');
  if (value.rules !== undefined && !isPlainObject(value.rules)) {
    throw refuse('has a models.rules that is not an object');
  }
  return value.defaults;
}

// Type-checked only: the CLI's outer bound, not these globs, is the bound.
function checkInstallRoots(value: unknown): void {
  const ok =
    isPlainObject(value) &&
    ['include', 'exclude', 'legacy'].every((key) => {
      const list = value[key];
      return (
        list === undefined ||
        (Array.isArray(list) && list.every((g) => typeof g === 'string'))
      );
    });
  if (!ok) throw refuse('has a malformed installRoots');
}

// Re-throw a validator's refusal as this file's, with its (escaped) message.
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    // Every validator wrapped here throws only ManifestValidationError;
    // anything else passes through unchanged.
    throw err instanceof ManifestValidationError
      ? new UpstreamManifestError(
          `pharn-oss's ${MANIFEST_FILE}: ${err.message}; refusing to install. Nothing was written.`,
        )
      : err;
  }
}

/**
 * Verify every declared file against the extracted tree: a regular file whose
 * RAW bytes hash to its `sha256`. fetchRepo calls this before it returns the
 * tree, so no command can write from a tree that fails.
 */
export function verifyUpstreamManifest(
  repoDir: string,
  manifest: UpstreamManifest,
): void {
  for (const file of manifest.files) {
    const abs = safeJoin(repoDir, file.path);
    if (!lstatSync(abs, { throwIfNoEntry: false })?.isFile()) {
      throw refuse(
        `declares ${file.path}, which the tree does not ship as a file`,
      );
    }
    if (!matchesRawSha256(abs, file.sha256)) {
      throw refuse(
        `declares a sha256 for ${file.path} that its bytes do not match`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Projections — what each branch point takes from a validated manifest.
// ---------------------------------------------------------------------------

/**
 * The capability index: grillers then lenses, each by name (the derivation's
 * order). An `applies` token outside this CLI's enum makes that capability
 * `unknown` — seen and reported, never installed — as the derivation does.
 */
export function manifestCapabilityIndex(m: UpstreamManifest): CapabilityIndex {
  const pharn = layoutPaths('pharn');
  const capabilities: CapabilityEntry[] = [];
  const unknown: UnknownCapability[] = [];
  const order = (c: ManifestCapability): string =>
    `${c.role === 'griller' ? 0 : 1}\0${c.name}`;
  const sorted = [...m.capabilities].sort((a, b) =>
    order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0,
  );
  for (const cap of sorted) {
    if (cap.applies === 'universal') {
      capabilities.push({
        name: cap.name,
        role: cap.role,
        applies: 'universal',
      });
      continue;
    }
    try {
      const tokens = cap.applies.map((t) =>
        assertAppliesToken(t, `capability "${cap.name}"`),
      );
      const applies = tokens.includes('universal')
        ? 'universal'
        : (tokens as Archetype[]);
      capabilities.push({ name: cap.name, role: cap.role, applies });
    } catch (err) {
      if (!(err instanceof ManifestValidationError)) throw err;
      unknown.push({
        name: cap.name,
        role: cap.role,
        subtree: capabilitySubtree(pharn, cap.role),
        reason: err.message,
      });
    }
  }
  return { capabilities, unknown };
}

/** The managed files of one selected capability, by dest (sorted). */
export function manifestCapabilityFiles(
  m: UpstreamManifest,
  cap: InstalledCapability,
): string[] {
  return m.files
    .filter(
      (f) => f.capability === cap.name && capRole(m, cap.name) === cap.role,
    )
    .map((f) => f.dest)
    .sort();
}

function capRole(
  m: UpstreamManifest,
  name: string,
): InstalledCapability['role'] | undefined {
  return m.capabilities.find((c) => c.name === name)?.role;
}

/**
 * Every managed file an install of `capabilities` writes, dest → its source in
 * the tree (the LICENSE at its declared dest). `if-absent` (settings) is not
 * in it: it is copied apart, only when the project has none.
 */
export function manifestInstallFiles(
  repoDir: string,
  m: UpstreamManifest,
  capabilities: readonly InstalledCapability[],
): Map<string, string> {
  const selected = new Set(capabilities.map((c) => `${c.role}:${c.name}`));
  const expected = new Map<string, string>();
  for (const f of m.files) {
    if (f.policy !== 'managed') continue;
    if (
      f.capability !== undefined &&
      !selected.has(`${capRole(m, f.capability)}:${f.capability}`)
    )
      continue;
    expected.set(f.dest, safeJoin(repoDir, f.path));
  }
  return expected;
}

/** Does the manifest declare `.claude/settings.json` (copied only if absent)? */
export function manifestDeclaresSettings(m: UpstreamManifest): boolean {
  return m.files.some(
    (f) => f.dest === CLAUDE_SETTINGS_FILE && f.policy === 'if-absent',
  );
}
