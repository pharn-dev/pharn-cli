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
  assertNoDotDot,
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
      // parseApplies refusal — lands in the same skip-and-report path, including
      // any refusal a FUTURE edit adds.
      try {
        // Validate the untrusted dir name BEFORE any path-join (P2). A name that
        // fails here is reported and joined no further — it never reaches the
        // filesystem at all.
        assertSafeString(name, `capability "${name}"`, CAPABILITY_NAME_RE);
        assertNoDotDot(name, `capability "${name}"`);

        const capFile = safeJoin(subtreeDir, `${name}/${name}.md`);
        const frontmatter = extractFrontmatter(
          readCapabilityMarkdown(capFile, name, subtree.dir),
          name,
        );
        // Cross-check the declared role against the authoritative subtree role.
        const role = assertRole(readField(frontmatter, 'role', name), name);
        if (role !== subtree.role) {
          throw new ManifestValidationError(
            `Capability "${name}" declares role "${role}" but lives under ${subtree.dir} (expected "${subtree.role}").`,
          );
        }
        const applies = parseApplies(
          readField(frontmatter, 'applies', name),
          name,
        );

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
 * Line-based, not a lazy regex: the block opens on a first line that is exactly
 * `---` and ends at the NEXT line that is `---` (trailing blanks allowed). A
 * regex capture (`^---\n([\s\S]*?)\n---`) skips an empty block (`---\n---`)
 * and reads the document BODY as frontmatter, up to the next `---`.
 */
function extractFrontmatter(content: string, name: string): string {
  const lines = content.split('\n');
  const close = lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line));
  if (lines[0] !== '---' || close === -1) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing a "---"-fenced frontmatter block.`,
    );
  }
  return lines.slice(1, close).join('\n');
}

/**
 * Read a single required scalar field from the frontmatter block, returning its
 * raw (quote-stripped) value. Hard-fails (naming the capability + field) when
 * the field is absent OR appears more than once (P5): pharn-oss's validator
 * keeps the LAST occurrence while a first-match reader keeps the FIRST, so a
 * duplicate is the one shape where the two could install different values. A
 * strict per-field regex — not a YAML parser.
 */
function readField(frontmatter: string, field: string, name: string): string {
  const re = new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, 'gm');
  const matches = [...frontmatter.matchAll(re)];
  if (matches.length === 0) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing the "${field}" frontmatter field.`,
    );
  }
  if (matches.length > 1) {
    throw new ManifestValidationError(
      `Capability "${name}" declares the "${field}" frontmatter field ${matches.length} times.`,
    );
  }
  return stripQuotes(matches[0]![1]!);
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse + validate the `applies` frontmatter value into the resolver's shape:
 * `["universal"]` → `'universal'` (always selected); a non-empty archetype array
 * → `Archetype[]`. Tokens may be quoted or bare — `[ssr, backend]` and
 * `["ssr","backend"]` parse identically (pharn-oss is not required to quote its
 * YAML). Each comma-separated element is validated WHOLE against the archetype
 * enum, so a dangerous element (e.g. `[../etc]`) hard-fails rather than being
 * silently skipped. Hard-fails (P2/P5) on: not a bracketed array, an empty array,
 * an unknown token, or `universal` mixed with archetypes (an ambiguous,
 * malformed declaration).
 */
function parseApplies(raw: string, name: string): 'universal' | Archetype[] {
  if (!/^\[.*\]$/.test(raw)) {
    throw new ManifestValidationError(
      `Capability "${name}" has a malformed "applies" value ${JSON.stringify(raw)} (expected a "[...]" array).`,
    );
  }
  // Split the bracketed array into comma-separated elements and normalize each
  // (trim + strip a matching quote pair via stripQuotes). Accepts quoted OR bare
  // YAML tokens; empties (a trailing comma, `[]`) drop out. Every surviving
  // element is enum-validated below — nothing is skipped, so junk hard-fails.
  const tokens = raw
    .slice(1, -1)
    .split(',')
    .map((t) => stripQuotes(t))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new ManifestValidationError(
      `Capability "${name}" has an empty "applies" array — every capability must declare its applicability.`,
    );
  }
  const validated = tokens.map((t) =>
    assertAppliesToken(t, `capability "${name}"`),
  );

  const universal = validated.includes('universal');
  if (universal && validated.length > 1) {
    throw new ManifestValidationError(
      `Capability "${name}" mixes "universal" with archetypes in "applies" — use exactly ["universal"] or archetypes only.`,
    );
  }
  if (universal) return 'universal';
  // Every remaining token is an Archetype (universal was excluded above).
  return validated as Archetype[];
}
