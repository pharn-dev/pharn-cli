import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { detectLayout, layoutPaths } from './layout.js';
import {
  assertAppliesToken,
  assertRole,
  assertSafeString,
  CAPABILITY_NAME_RE,
  ManifestValidationError,
  safeJoin,
} from './validate.js';
import type {
  Archetype,
  CapabilityEntry,
  CapabilityIndex,
  UnknownCapability,
} from '../types.js';

// ---------------------------------------------------------------------------
// Capability index — the FETCH BOUNDARY (P2). This is the untrusted-frontmatter
// → typed CapabilityIndex boundary that resolve-capabilities.ts explicitly
// defers ("parsing + validating the untrusted index bytes is the fetch
// boundary's job, a later increment"). Given a fetched pharn-oss clone, it
// enumerates the griller + lens subtrees and derives one CapabilityEntry per
// capability from its markdown frontmatter — pharn-oss declares applicability in
// each capability's `applies:` field (there is no separate index file).
//
// Trust (P2): the fetched frontmatter is untrusted. We read ONLY the three
// declared fields (`name`/`role`/`applies`) via a STRICT field reader — never a
// general YAML parser over untrusted bytes — and validate every value against a
// fixed allowlist (validate.ts): dir names against CAPABILITY_NAME_RE (+ no
// `..`) before any path-join, `role` against {griller,lens}, each `applies`
// token against the archetype/`universal` enum. Every filesystem read is
// safeJoin-guarded. No free-text frontmatter value escapes: the typed
// `capabilities` output carries only enum/regex-validated fields.
//
// FORWARD COMPATIBILITY — fail closed on INSTALLING, never on SEEING (the
// contract this file exists to hold). A released CLI always fetches `main` HEAD
// and can never pin older content (lib/repo.ts), so before this contract ONE
// routine grammar evolution upstream — a new capability subdirectory without its
// markdown, a new `role`, a new `applies` token — aborted init/add/update in
// EVERY deployed CLI simultaneously, with no rollback lever. `add` was doubly
// wedged: its version gate points at `pharn update`, whose own first act is this
// parse.
//
// So a malformed or unknown value no longer kills the index. The tolerance is
// scoped by WHERE the failure happens, not by an enumerated list of shapes:
// ANY ManifestValidationError raised while processing ONE capability inside the
// per-capability loop becomes an `unknown` entry plus a `continue`. Enumerating
// only some shapes would be the same bug again on a different day. Nothing in
// `unknown` is ever pushed to `capabilities`, so nothing unvalidated can be
// selected, copied, or enumerated by the install manifest — and nothing is
// SILENTLY dropped either: every caller renders the list
// (lib/unknown-capabilities.ts).
//
// What stays fatal is what is STRUCTURAL: a missing subtree is not "one unknown
// capability", it is a clone whose shape the CLI cannot address at all.
//
// One axis (P3): deriving the typed index from fetched capability frontmatter.
// The disk-reading shape is intentionally minimal (a strict frontmatter reader
// co-located here); the selection RULE over the produced index lives next door
// in resolve-capabilities.ts, and the archetype detection in detect-archetype.ts.
// ---------------------------------------------------------------------------

/**
 * Parse + validate the capability index from a fetched pharn-oss clone.
 *
 * Deterministic (P5): capabilities are enumerated in sorted directory order
 * within each subtree, grillers before lenses, so the same clone always yields
 * the same `capabilities` AND the same `unknown` list.
 *
 * A capability whose directory name, markdown, frontmatter, `role` or `applies`
 * fails validation is SKIPPED and reported in `unknown` — never installed, never
 * silent. Only a missing subtree throws (structural, see the header).
 */
export function parseCapabilityIndex(repoDir: string): CapabilityIndex {
  const capabilities: CapabilityEntry[] = [];
  const unknown: UnknownCapability[] = [];

  // Mirror the fetched clone's layout (flat OR the relocated pharn/) so the CLI
  // enumerates capabilities wherever pharn-oss put them (P5 — membership on the
  // clone, lib/layout.ts). Each subtree is authoritative for `role`; the
  // frontmatter `role` is cross-checked against it (wrong subtree → hard-fail).
  const paths = layoutPaths(detectLayout(repoDir));
  const subtrees: { dir: string; role: 'griller' | 'lens' }[] = [
    { dir: paths.grillers, role: 'griller' },
    { dir: paths.lenses, role: 'lens' },
  ];

  for (const subtree of subtrees) {
    const subtreeDir = safeJoin(repoDir, subtree.dir);
    if (!existsSync(subtreeDir)) {
      throw new ManifestValidationError(
        `Capability subtree "${subtree.dir}" is missing in the fetched repo.`,
      );
    }

    const names = readdirSync(subtreeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => e.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const name of names) {
      // ONE try around the WHOLE loop body. Scoping the tolerance by LOCATION
      // (this capability) rather than by shape is what makes it total: every
      // throw site reachable from here — the dir-name allowlist, the missing
      // markdown, the missing frontmatter fence, a missing `role`/`applies`
      // field, an invalid role, the role/subtree mismatch, and every
      // readApplies refusal — lands in the same skip-and-report path, including
      // any refusal a FUTURE edit adds.
      try {
        // Validate the untrusted dir name BEFORE any path-join (P2). A name that
        // fails here is reported and joined no further — it never reaches the
        // filesystem at all. CAPABILITY_NAME_RE admits no `.`, so no `..`.
        assertSafeString(name, `capability "${name}"`, CAPABILITY_NAME_RE);

        const capFile = safeJoin(subtreeDir, `${name}/${name}.md`);
        const frontmatter = extractFrontmatter(
          readCapabilityMarkdown(capFile, name, subtree.dir),
          name,
        );
        // Cross-check the declared role against the authoritative subtree role.
        const role = assertRole(readRole(frontmatter, name), name);
        if (role !== subtree.role) {
          throw new ManifestValidationError(
            `Capability "${name}" declares role "${role}" but lives under ${subtree.dir} (expected "${subtree.role}").`,
          );
        }
        const applies = readApplies(frontmatter, name);

        capabilities.push({ name, role, applies });
      } catch (err) {
        // ONLY a validation refusal is tolerated. An I/O failure (the clone
        // vanished mid-run, a permission error) is genuinely exceptional and
        // still propagates — swallowing it would turn a broken clone into a
        // silently empty index, which is the fail-open direction.
        if (!(err instanceof ManifestValidationError)) throw err;
        // The SUBTREE's role, not the frontmatter's: the declared role may be
        // exactly what failed, and the subtree is authoritative here anyway
        // (see the cross-check above). That is what lets a caller build a
        // `role:name` key for an entry it could not otherwise type.
        unknown.push({
          name,
          role: subtree.role,
          subtree: subtree.dir,
          reason: err.message,
        });
      }
    }
  }

  return { capabilities, unknown };
}

// O_NOFOLLOW refuses a symlinked final component (ELOOP) and O_NONBLOCK keeps
// the open of a FIFO from blocking forever. Both are POSIX; where a platform
// lacks one (win32) the constant is absent and the flag is simply not set.
const OPEN_FLAGS =
  fsConstants.O_RDONLY |
  (fsConstants.O_NOFOLLOW ?? 0) |
  (fsConstants.O_NONBLOCK ?? 0);

/**
 * Read one capability's markdown, refusing anything that is not a regular file
 * with a ManifestValidationError — the error the per-capability loop tolerates.
 *
 * `existsSync` + `readFileSync` let a DIRECTORY at this path through the check
 * and then threw EISDIR, which is NOT a validation error, so one oddly-shaped
 * upstream capability aborted the whole index for every deployed CLI. The
 * type check is made on the OPENED descriptor and the read goes through that
 * same descriptor, so nothing can swap the path between the check and the read.
 * A directory, a symlink (never followed — it could point outside the clone)
 * or a FIFO becomes `unknown`. Other I/O failures still propagate.
 */
function readCapabilityMarkdown(
  capFile: string,
  name: string,
  subtreeDir: string,
): string {
  let fd: number;
  try {
    fd = openSync(capFile, OPEN_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ManifestValidationError(
        `Capability "${name}" in ${subtreeDir} is missing its markdown ${name}/${name}.md.`,
      );
    }
    if (code === 'ELOOP' || code === 'EISDIR') {
      throw new ManifestValidationError(
        `Capability "${name}" in ${subtreeDir}: ${name}/${name}.md is not a regular file.`,
      );
    }
    throw err;
  }
  try {
    if (!fstatSync(fd).isFile()) {
      throw new ManifestValidationError(
        `Capability "${name}" in ${subtreeDir}: ${name}/${name}.md is not a regular file.`,
      );
    }
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Extract the raw `---`-fenced frontmatter block from a capability markdown
 * file. Only this block is parsed — a field-looking line in the prose body is
 * never read. Hard-fails (naming the capability) when no frontmatter fence is
 * present (P5).
 *
 * The fence is UPSTREAM'S rule, ported literally from pharn-oss's own validator
 * (this repo's copy: .dev/floor/validate.mjs → parseFrontmatter), so a
 * capability upstream's CI passes is never skipped here for its fence (P4):
 *   - the file must START with `---`;
 *   - the block is everything from the fourth character up to the first newline
 *     followed by `---` — so it closes at the next line that STARTS with `---`
 *     (`---`, `----`, `--- note`), and the rest of the opening line belongs to
 *     the block;
 *   - the block is trimmed, as upstream trims it.
 * An empty block (`---` then `---`) is '' — every field is missing, and both
 * parsers refuse it rather than reading the BODY as frontmatter (PHARN-14).
 * tests/capability-index.test.ts runs every fence shape through the validator's
 * own function and requires the same verdict.
 */
function extractFrontmatter(content: string, name: string): string {
  const end = content.startsWith('---') ? content.indexOf('\n---', 3) : -1;
  if (end === -1) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing a "---"-fenced frontmatter block.`,
    );
  }
  return content.slice(3, end).trim();
}

/**
 * One frontmatter field's value, read by UPSTREAM'S line rule — ported
 * literally from pharn-oss's validator (pharn/floor/validate.mjs →
 * parseFrontmatter; vendored for the differential test at
 * tests/fixtures/pharn-oss/validate.mjs), so the CLI and upstream's CI read the
 * same value from the same block (F-26):
 *   - the block is split on `\n`; a line is a field when it matches
 *     `^([A-Za-z0-9_]+):\s*(.*)$` (so a key never has leading whitespace, and
 *     `roles:` is not `role:`), and its value is the trimmed rest of the line;
 *   - a value wrapped in `[` … `]` is an array: split on `,`, each element
 *     trimmed and unquoted, empty elements dropped; anything else is a scalar,
 *     unquoted;
 *   - unquoting strips ONE leading and ONE trailing `"`/`'`, independently;
 *   - a key that appears more than once keeps its LAST value.
 * Last-wins is safe to adopt (it used to be refused, PHARN-14, because a
 * first-match reader here could install a different value than upstream
 * validated): the value read is exactly the one upstream's CI checked, and it
 * is still validated against the role / applies enums below before anything
 * uses it — an earlier occurrence is discarded, never read.
 *
 * The one deliberate difference: a single trailing `\r` is dropped from each
 * line first. Upstream's `(.*)$` cannot match across a CR, so it reads no field
 * from a CRLF file and refuses it — upstream never ships one; this reader is
 * more lenient there, never less.
 *
 * `undefined` = the field is absent (or its last occurrence is empty — upstream
 * reads that as missing too).
 */
const FIELD_LINE_RE = /^([A-Za-z0-9_]+):\s*(.*)$/;

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

function readField(
  frontmatter: string,
  field: string,
): string | string[] | undefined {
  let value: string | string[] | undefined;
  for (const raw of frontmatter.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const m = FIELD_LINE_RE.exec(line);
    if (!m || m[1] !== field) continue;
    const val = m[2]!.trim();
    value =
      val.startsWith('[') && val.endsWith(']')
        ? val
            .slice(1, -1)
            .split(',')
            .map((s) => unquote(s.trim()))
            .filter(Boolean)
        : unquote(val);
  }
  return value === '' ? undefined : value;
}

function missingField(field: string, name: string): ManifestValidationError {
  return new ManifestValidationError(
    `Capability "${name}" is missing the "${field}" frontmatter field.`,
  );
}

/**
 * The `role` field: one scalar, checked against the role enum by the caller
 * (`assertRole`). An array (`role: [lens]`) is not a role — upstream refuses it
 * too.
 */
function readRole(frontmatter: string, name: string): string {
  const role = readField(frontmatter, 'role');
  if (role === undefined) throw missingField('role', name);
  if (Array.isArray(role)) {
    throw new ManifestValidationError(
      `Capability "${name}" has a malformed "role" value ${JSON.stringify(role)} (expected one role, not an array).`,
    );
  }
  return role;
}

/**
 * Parse + validate the `applies` value into the resolver's shape — upstream's
 * acceptance rule (validate.mjs CHECK 4b), ported: an array is its elements, a
 * non-empty scalar is a one-element list (`applies: universal` reads as
 * `applies: [universal]`, `applies: ssr` as `[ssr]`), and every element must be
 * in the enum. Tokens may be quoted or bare. Then:
 *   - any `universal` → `'universal'` (always selected). Upstream accepts
 *     `[universal, ssr]`, and `universal` already selects every archetype, so
 *     the archetypes beside it add nothing — it resolves as `[universal]` does
 *     instead of being skipped;
 *   - otherwise the archetype list.
 * Hard-fails (P2/P5) on a missing field, an empty array, or any element outside
 * the enum (`[../etc]`, `mobile`, or a quoted array `"[ssr]"`, which upstream
 * reads as one scalar). Nothing upstream refuses is accepted.
 */
function readApplies(
  frontmatter: string,
  name: string,
): 'universal' | Archetype[] {
  const raw = readField(frontmatter, 'applies');
  if (raw === undefined) throw missingField('applies', name);
  const tokens = Array.isArray(raw) ? raw : [raw];
  if (tokens.length === 0) {
    throw new ManifestValidationError(
      `Capability "${name}" has an empty "applies" array — every capability must declare its applicability.`,
    );
  }
  const validated = tokens.map((t) =>
    assertAppliesToken(t, `capability "${name}"`),
  );
  if (validated.includes('universal')) return 'universal';
  // Every token is an Archetype (universal was handled above).
  return validated as Archetype[];
}
