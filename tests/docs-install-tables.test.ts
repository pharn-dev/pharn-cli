import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  FEATURES_README,
} from '../src/lib/constants.js';
import { PHARN_CONFIG_FILE } from '../src/lib/install-manifest.js';
import { RECORDS_FILE } from '../src/lib/install-records.js';
import { layoutPaths } from '../src/lib/layout.js';

// The two user-facing "what an install writes" tables (README.md and
// docs/getting-started.md) are the first thing a new user compares their own
// project against. Nothing checked them against the installer, and they had
// drifted: both listed `pharn-contracts/` and `.dev/floor/` — flat-layout paths
// no current install produces — while omitting `features/README.md` entirely.
//
// This pins the ONE thing a deterministic gate can own here: the SET OF PATHS.
// The required set is DERIVED from layoutPaths('pharn') plus the two
// layout-invariant `.claude` constants, so renaming PHARN_FLOOR_DIR (say) fails
// this test until both docs follow. It deliberately does NOT judge the prose: a
// description can still be wrong, and a row for something never installed is not
// caught — the forbidden half only refuses FLAT paths in the Artifact column.
//
// Scope split, on purpose:
//   - REQUIRED is checked over the whole install SECTION (table + the layout
//     note under it), because some paths belong in the note, not a row.
//   - FORBIDDEN is checked over the Artifact COLUMN only, because the note
//     names the flat paths deliberately — that is what makes it a note.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pharn = layoutPaths('pharn');
const flat = layoutPaths('flat');

/** Every project-root-relative path a `pharn`-layout install writes. */
const REQUIRED = [
  pharn.grillers,
  pharn.lenses,
  pharn.contracts,
  pharn.core,
  pharn.floor,
  pharn.license.to,
  ...pharn.docs,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  FEATURES_README,
  PHARN_CONFIG_FILE,
  RECORDS_FILE,
];

/**
 * Flat-layout directories that must not LEAD a row: naming one in the Artifact
 * column presents a legacy path as what an install produces, which is the exact
 * defect this test exists for. `flat.license.to` (`PHARN-LICENSE`) is excluded —
 * it is named there on purpose, parenthesized beside `pharn/LICENSE`.
 */
const FORBIDDEN_LEADS = [
  flat.grillers,
  flat.lenses,
  flat.contracts,
  flat.core,
  flat.floor,
];

const DOCS = ['README.md', join('docs', 'getting-started.md')];

/** The install table plus the prose under it, up to the next `## ` heading. */
function installSection(file: string): string {
  const lines = readFileSync(join(repoRoot, file), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\| Artifact\s+\|/.test(l));
  expect(start, `${file}: no install table found`).toBeGreaterThan(-1);
  const rest = lines.slice(start);
  const end = rest.findIndex((l, i) => i > 0 && l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** The first cell of every body row of the install table. */
function artifactColumn(file: string): string[] {
  return installSection(file)
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l))
    .slice(1)
    .map((l) => (l.split('|')[1] ?? '').trim());
}

describe.each(DOCS)('%s install table', (file) => {
  it('names every path a pharn-layout install writes', () => {
    const section = installSection(file);
    for (const path of REQUIRED) {
      expect(section, `${file} never names ${path}`).toContain(`\`${path}`);
    }
  });

  it('never leads a row with a flat-layout path', () => {
    for (const cell of artifactColumn(file)) {
      for (const span of cell.match(/`[^`]+`/g) ?? []) {
        const inner = span.slice(1, -1);
        for (const legacy of FORBIDDEN_LEADS) {
          expect(
            inner.startsWith(legacy),
            `${file}: the Artifact column names the flat path ${span}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('the two install tables agree', () => {
  it('list the same artifacts in the same order', () => {
    const [readme, guide] = DOCS.map((f) => artifactColumn(f));
    expect(readme).toEqual(guide);
  });
});
