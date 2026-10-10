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
  it('is documented as containing `ask`, not ending with it', () => {
    const text = read('docs/reference/pharn-config.md');
    expect(text).not.toMatch(/must end with `ask`/i);
    expect(text).not.toContain('last entry is not `ask`');
    expect(text).toContain('Must contain `ask`');
    expect(text).toContain('does not contain `ask`');
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
