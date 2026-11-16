import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pins the user-facing claims about the `models` block and the config keys, so
// a doc cannot drift back to a statement the code or pharn-oss has made false.
const root = join(import.meta.dirname, '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const MODEL_DOCS = [
  'docs/reference/pharn-config.md',
  'docs/troubleshooting.md',
  'docs/commands/update.md',
  'docs/commands/status.md',
  'docs/commands/init.md',
  'CLAUDE.md',
];

describe('the models block claims', () => {
  it.each(MODEL_DOCS)('%s does not call the block "never routing"', (rel) => {
    const text = read(rel);
    expect(text).not.toContain('never routing that happens');
    expect(text).not.toContain('change both or neither');
    expect(text).not.toContain('nothing reads this block');
    expect(text).not.toContain('frontmatter, not this block');
  });

  it('the reference names what reads the block, what does not, and the edit consequences', () => {
    const text = read('docs/reference/pharn-config.md');
    expect(text).toContain('`/pharn-ship` and `/pharn-loop` run the stages');
    expect(text).toContain('**effort** is never routed');
    expect(text).toContain('A `/pharn-<stage>` you run yourself');
    expect(text).toContain('Nothing in an installed project runs it');
    expect(text).toContain('That file is then `modified`');
    expect(text).toContain('No file drifts');
  });
});

describe('seam.resolutionOrder', () => {
  // The rule itself is pharn-oss's now (CORE-165), so the reference no longer
  // states it — but it must still never claim the old, wrong rule.
  it('is never documented as having to end with `ask`', () => {
    const text = read('docs/reference/pharn-config.md');
    expect(text).not.toMatch(/must end with `ask`/i);
    expect(text).not.toContain('last entry is not `ask`');
    expect(text).toContain('"ask"');
    expect(text).toContain('pharn-contracts/seam-config.md');
  });
});

// CORE-165: `seam` is pharn-oss's. The reference must not describe a CLI-side
// rule set (the CLI has none), nor a block `init` writes or resets.
describe('the seam block', () => {
  it('is documented as pharn-oss’s: never validated, never written, carried verbatim', () => {
    const text = read('docs/reference/pharn-config.md');
    expect(text).toMatch(/\*\*neither validates nor\s+writes it\*\*/);
    expect(text).toContain('`pharn init` writes no `seam` block');
    expect(text).toContain('`pharn-contracts/seam-config.md`');
    expect(text).not.toContain('rejected by name: an unknown sibling key');
    expect(text).not.toMatch(/`seam` (is reset|goes back) to/);
    expect(text).not.toContain('seam-config.ts');
  });
});

describe('the user-owned keys', () => {
  it('lists every key pharn-oss documents, each in the table', () => {
    const text = read('docs/reference/pharn-config.md');
    for (const key of ['testResults', 'ship', 'gates', 'budget']) {
      expect(text).toMatch(new RegExp(`^\\| \`${key}\` +\\|`, 'm'));
    }
    expect(text).toContain('`budget.instructionGrowthBytes`');
    expect(text).toContain('`gates.exclude`');
    expect(text).toContain('does **not** describe');
  });
});
