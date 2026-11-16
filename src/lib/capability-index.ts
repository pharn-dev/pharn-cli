import {
  closeSync,
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
// Capability index — the FETCH BOUNDARY: untrusted capability frontmatter in a
// fetched pharn-oss clone → a typed CapabilityIndex, one CapabilityEntry per
// griller/lens directory (pharn-oss declares applicability in each capability's
// `applies:` field; there is no index file).
//
// Trust: only `role` and `applies` are read (the name is the directory's), by a
// STRICT line reader — never a general YAML parser — and every value is checked
// against an allowlist (validate.ts) before use: dir names against
// CAPABILITY_NAME_RE before any path-join, `role` against {griller,lens}, each
// `applies` token against the archetype/`universal` enum. Every read is
// safeJoin-guarded, and `capabilities` carries only validated fields.
//
// Fail closed on INSTALLING, never on SEEING: upstream grammar evolves faster
// than CLI releases (a new role, a new token), so ANY ManifestValidationError
// raised for ONE capability makes it an `unknown` entry instead of aborting the
// index. Scoped by location, not by shape, so a future refusal is covered too.
// Nothing in `unknown` is ever selected or copied, and every caller names the
// list (lib/unknown-capabilities.ts). Only a missing subtree stays fatal: that
// is a clone whose shape the CLI cannot address at all.
// ---------------------------------------------------------------------------

/**
 * Parse + validate the capability index from a fetched pharn-oss clone, in
 * sorted directory order, grillers before lenses. A capability failing any
 * validation is SKIPPED and reported in `unknown` — never installed, never
 * silent. Only a missing subtree throws.
 */
export function parseCapabilityIndex(repoDir: string): CapabilityIndex {
  const capabilities: CapabilityEntry[] = [];
  const unknown: UnknownCapability[] = [];

  // Mirror the clone's layout (flat OR pharn/). Each subtree is authoritative
  // for `role`; the frontmatter `role` is cross-checked against it.
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
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const name of names) {
      // ONE try around the WHOLE loop body, so every throw site reachable from
      // here — including one a future edit adds — lands in skip-and-report.
      try {
        // Validate the untrusted dir name BEFORE any path-join; a name that
        // fails never reaches the filesystem. CAPABILITY_NAME_RE admits no `.`.
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
        // ONLY a validation refusal is tolerated. An I/O failure still
        // propagates: swallowing it would turn a broken clone into a silently
        // empty index (fail open).
        if (!(err instanceof ManifestValidationError)) throw err;
        // The SUBTREE's role: the declared role may be what failed, and callers
        // still need a `role:name` key.
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

/**
 * Read one capability's markdown, refusing anything that is not a regular file
 * with a ManifestValidationError (the error the loop tolerates). The type check
 * is made on the OPENED descriptor and the read goes through it, so a directory
 * becomes `unknown` rather than an EISDIR that aborts the index. Other I/O
 * failures still propagate.
 */
function readCapabilityMarkdown(
  capFile: string,
  name: string,
  subtreeDir: string,
): string {
  let fd: number;
  try {
    fd = openSync(capFile, 'r');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ManifestValidationError(
        `Capability "${name}" in ${subtreeDir} is missing its markdown ${name}/${name}.md.`,
      );
    }
    if (code === 'EISDIR') {
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
 * One leading U+FEFF, and the lead that makes a fence DISPLACED: only
 * whitespace or Unicode format characters before `---`. Both are pharn-oss's
 * own, from pharn/floor/frontmatter-core.mjs (`stripBom`, `DISPLACED_LEAD_RE`).
 */
const BOM_RE = /^\uFEFF/;
const DISPLACED_LEAD_RE = /^[\s\p{Cf}]+(?=---)/u;

/**
 * Extract the raw `---`-fenced frontmatter block; a field-looking line in the
 * body is never read. Hard-fails when no fence is present or it is displaced.
 *
 * The fence is UPSTREAM'S rule, ported literally from pharn-oss's validator
 * (pharn/floor/validate.mjs → parseFrontmatter → frontmatter-core.mjs
 * `looseFrontmatter`, vendored at tests/fixtures/pharn-oss/), so a capability
 * upstream's CI passes is never skipped for its fence, and one it refuses is
 * never installed:
 *   - exactly ONE leading byte-order mark is stripped first;
 *   - the file must then START with `---`;
 *   - the block runs from the fourth character to the first newline followed
 *     by `---` (so `----` or `--- note` closes it too), and is trimmed;
 *   - a fence after a DISPLACED lead that closes is refused with its own reason
 *     (upstream REDs it when role-bearing; a role-less one is refused anyway). A
 *     displaced lead whose fence never closes is no fence at all.
 * An empty block is '' — every field missing, never the BODY read instead.
 * tests/capability-index.test.ts runs every fence shape through the vendored
 * validator's own function and requires the same verdict.
 */
function extractFrontmatter(content: string, name: string): string {
  let text = content.replace(BOM_RE, '');
  let displaced = false;
  if (!text.startsWith('---')) {
    const lead = DISPLACED_LEAD_RE.exec(text);
    if (lead) {
      text = text.slice(lead[0].length);
      displaced = true;
    }
  }
  const end = text.startsWith('---') ? text.indexOf('\n---', 3) : -1;
  if (end === -1) {
    throw new ManifestValidationError(
      `Capability "${name}" is missing a "---"-fenced frontmatter block.`,
    );
  }
  if (displaced) {
    throw new ManifestValidationError(
      `Capability "${name}": the frontmatter fence is not at the start of the file (whitespace or an invisible character precedes the opening ---).`,
    );
  }
  return text.slice(3, end).trim();
}

/**
 * One frontmatter field's value, read by UPSTREAM'S line rule, ported literally
 * from pharn/floor/validate.mjs → parseFrontmatter (vendored at
 * tests/fixtures/pharn-oss/validate.mjs, differential-tested):
 *   - the block is split on `\r?\n`; a field line matches
 *     `^([A-Za-z0-9_]+):\s*(.*)$` and its value is the trimmed rest;
 *   - a value wrapped in `[` … `]` is an array: split on `,`, each element
 *     trimmed and unquoted, empties dropped; anything else is an unquoted scalar;
 *   - unquoting strips ONE leading and ONE trailing `"`/`'`, independently;
 *   - a repeated key keeps its LAST value — exactly the one upstream's CI
 *     checked, and still enum-validated below.
 * A lone `\r` inside a line yields no field, upstream and here.
 *
 * `undefined` = absent (or its last occurrence is empty, as upstream reads it).
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
  for (const line of frontmatter.split(/\r?\n/)) {
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
 * The `role` field: one scalar, enum-checked by the caller (`assertRole`). An
 * array (`role: [lens]`) is refused, as upstream refuses it.
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
 * Parse + validate `applies` by upstream's acceptance rule (validate.mjs CHECK
 * 4b), ported: an array is its elements, a non-empty scalar is a one-element
 * list, and every element must be in the enum. Any `universal` → `'universal'`
 * (it already selects every archetype, so `[universal, ssr]` resolves as
 * `[universal]`); otherwise the archetype list. Hard-fails on a missing field,
 * an empty array, or any element outside the enum (`[../etc]`, `mobile`, a
 * quoted `"[ssr]"`, which upstream reads as one scalar).
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
