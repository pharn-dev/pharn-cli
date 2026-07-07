import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { safeJoin } from './install-modules.js';
import { GRILLERS_DIR, LENSES_DIR } from './constants.js';
import {
  assertAppliesToken,
  assertNoDotDot,
  assertRole,
  assertSafeString,
  CAPABILITY_NAME_RE,
  ManifestValidationError,
} from './validate.js';
import type { Archetype, CapabilityEntry, CapabilityIndex } from '../types.js';

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
// token against the archetype/`universal` enum. A malformed or unknown value
// HARD-FAILS naming the offending capability (P5) — never a silent skip, never a
// silent trust. Every filesystem read is safeJoin-guarded. No free-text
// frontmatter value escapes: the typed output carries only enum/regex-validated
// fields.
//
// One axis (P3): deriving the typed index from fetched capability frontmatter.
// The disk-reading shape is intentionally minimal (a strict frontmatter reader
// co-located here); the selection RULE over the produced index lives next door
// in resolve-capabilities.ts, and the archetype detection in detect-archetype.ts.
// ---------------------------------------------------------------------------

// One capability subtree in the fetched repo and the role every capability under
// it carries. The subtree is authoritative for `role`; the frontmatter `role` is
// cross-checked against it (a file in the wrong subtree hard-fails).
const SUBTREES: { dir: string; role: 'griller' | 'lens' }[] = [
  { dir: GRILLERS_DIR, role: 'griller' },
  { dir: LENSES_DIR, role: 'lens' },
];

/**
 * Parse + validate the capability index from a fetched pharn-oss clone.
 * Deterministic (P5): capabilities are enumerated in sorted directory order
 * within each subtree, grillers before lenses, so the same clone always yields
 * the same index. Throws (naming the offending capability) on any missing
 * subtree, missing capability markdown, malformed frontmatter, or invalid
 * `role`/`applies` value — no partial or silently-degraded index.
 */
export function parseCapabilityIndex(repoDir: string): CapabilityIndex {
  const capabilities: CapabilityEntry[] = [];

  for (const subtree of SUBTREES) {
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
      // Validate the untrusted dir name BEFORE any path-join (P2).
      assertSafeString(name, `capability "${name}"`, CAPABILITY_NAME_RE);
      assertNoDotDot(name, `capability "${name}"`);

      const capFile = safeJoin(subtreeDir, `${name}/${name}.md`);
      if (!existsSync(capFile)) {
        throw new ManifestValidationError(
          `Capability "${name}" in ${subtree.dir} is missing its markdown ${name}/${name}.md.`,
        );
      }

      const frontmatter = extractFrontmatter(
        readFileSync(capFile, 'utf8'),
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
    }
  }

  return { capabilities };
}

/**
 * Extract the raw `---`-fenced frontmatter block from a capability markdown
 * file. Only this block is parsed — a field-looking line in the prose body is
 * never read. Hard-fails (naming the capability) when no frontmatter fence is
 * present (P5).
 */
function extractFrontmatter(content: string, name: string): string {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing a "---"-fenced frontmatter block.`,
    );
  }
  return match[1]!;
}

/**
 * Read a single required scalar field from the frontmatter block, returning its
 * raw (quote-stripped) value. Hard-fails (naming the capability + field) when
 * the field is absent (P5). A strict per-field regex — not a YAML parser.
 */
function readField(frontmatter: string, field: string, name: string): string {
  const re = new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, 'm');
  const match = re.exec(frontmatter);
  if (!match) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing the "${field}" frontmatter field.`,
    );
  }
  return stripQuotes(match[1]!);
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
 * → `Archetype[]`. Hard-fails (P2/P5) on: not a bracketed array, an empty array,
 * an unknown token, or `universal` mixed with archetypes (an ambiguous,
 * malformed declaration).
 */
function parseApplies(raw: string, name: string): 'universal' | Archetype[] {
  if (!/^\[.*\]$/.test(raw)) {
    throw new ManifestValidationError(
      `Capability "${name}" has a malformed "applies" value ${JSON.stringify(raw)} (expected a "[...]" array).`,
    );
  }
  const tokens = [...raw.matchAll(/["']([a-z0-9]+)["']/g)].map((m) => m[1]!);
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
