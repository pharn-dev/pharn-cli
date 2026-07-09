import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { parseCapabilityIndex } from '../src/lib/capability-index.js';
import { ManifestValidationError } from '../src/lib/validate.js';

const GRILLERS = 'pharn-pipeline/grillers';
const LENSES = 'pharn-review';

// A capability markdown with the three declared frontmatter fields.
function fm(role: string, applies: string): string {
  return `---\nname: cap-name\nrole: ${role}\napplies: ${applies}\ncoupling: agnostic\n---\n\n# capability\n\nbody with a stray applies: ["ignored"] line in prose\n`;
}

// Ensure both subtree roots exist (parseCapabilityIndex requires both), then let
// callers add capabilities.
function scaffold(repo: string): void {
  mkdirSync(join(repo, GRILLERS), { recursive: true });
  mkdirSync(join(repo, LENSES), { recursive: true });
}

function writeCap(
  repo: string,
  subtree: string,
  name: string,
  body: string,
): void {
  const dir = join(repo, subtree, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.md`), body);
}

describe('parseCapabilityIndex', () => {
  const tmp = useTmpDir();

  it('derives a typed index from frontmatter (grillers then lenses, sorted)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["ssr", "spa"]'));
    writeCap(repo, LENSES, 'trust-fence', fm('lens', '["universal"]'));
    writeCap(repo, LENSES, 'n-plus-one', fm('lens', '["backend", "ssr"]'));

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities).toEqual([
      { name: 'a11y', role: 'griller', applies: ['ssr', 'spa'] },
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: ['backend', 'ssr'] },
      { name: 'trust-fence', role: 'lens', applies: 'universal' },
    ]);
  });

  it('maps ["universal"] to the string, not an array (the resolver contract)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));
    const [entry] = parseCapabilityIndex(repo).capabilities;
    expect(entry!.applies).toBe('universal');
  });

  // archetype-path-context: `applies` tokens may be UNQUOTED YAML — pharn-oss is
  // not required to quote them. `[ssr, backend]` parses like `["ssr","backend"]`.
  it('accepts unquoted YAML applies tokens ([ssr, backend])', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '[ssr, backend]'));
    const [entry] = parseCapabilityIndex(repo).capabilities;
    expect(entry!.applies).toEqual(['ssr', 'backend']);
  });

  it('accepts unquoted [universal] → the string (resolver contract)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'security', fm('griller', '[universal]'));
    const [entry] = parseCapabilityIndex(repo).capabilities;
    expect(entry!.applies).toBe('universal');
  });

  it('accepts mixed quoted/unquoted tokens ([ssr, "backend"])', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '[ssr, "backend"]'));
    const [entry] = parseCapabilityIndex(repo).capabilities;
    expect(entry!.applies).toEqual(['ssr', 'backend']);
  });

  // The enum gate must survive the loosening: an unknown UNQUOTED token still
  // hard-fails (fail-closed, P2/P5) — the split validates each element WHOLE.
  it('still hard-fails an unknown unquoted token (enum gate survives loosening)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '[ssr, mobile]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/mobile|invalid applies/);
  });

  it('is deterministic — identical result across repeated parses', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["ssr", "spa"]'));
    writeCap(repo, LENSES, 'n-plus-one', fm('lens', '["backend"]'));
    expect(parseCapabilityIndex(repo)).toEqual(parseCapabilityIndex(repo));
  });

  it('only reads the frontmatter block, never a field-looking prose line', () => {
    const repo = tmp.path();
    scaffold(repo);
    // fm() body contains a stray `applies: ["ignored"]` line in prose.
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["ssr"]'));
    const [entry] = parseCapabilityIndex(repo).capabilities;
    expect(entry!.applies).toEqual(['ssr']);
  });

  it('hard-fails on an invalid role, naming the capability (P2/P5)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'weird', fm('auditor', '["universal"]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(ManifestValidationError);
    expect(() => parseCapabilityIndex(repo)).toThrow(/weird/);
  });

  it('hard-fails when a role does not match its subtree', () => {
    const repo = tmp.path();
    scaffold(repo);
    // a lens frontmatter placed under the grillers subtree.
    writeCap(repo, GRILLERS, 'misfiled', fm('lens', '["universal"]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/misfiled/);
  });

  it('hard-fails on an unknown applies token (P2 enum)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["mobile"]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/mobile|invalid applies/);
  });

  it('hard-fails when universal is mixed with archetypes (P5)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["universal", "ssr"]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/mixes "universal"/);
  });

  it('hard-fails on an empty applies array', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '[]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/empty "applies"/);
  });

  it('hard-fails on a non-array applies value', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', 'universal'));
    expect(() => parseCapabilityIndex(repo)).toThrow(/malformed "applies"/);
  });

  it('hard-fails on a capability directory name outside the allowlist (P2)', () => {
    const repo = tmp.path();
    scaffold(repo);
    // Underscore is rejected by CAPABILITY_NAME_RE before any path-join.
    writeCap(repo, GRILLERS, 'bad_name', fm('griller', '["universal"]'));
    expect(() => parseCapabilityIndex(repo)).toThrow(ManifestValidationError);
  });

  it('hard-fails when the capability markdown is missing', () => {
    const repo = tmp.path();
    scaffold(repo);
    mkdirSync(join(repo, GRILLERS, 'empty'), { recursive: true });
    expect(() => parseCapabilityIndex(repo)).toThrow(
      /empty.*missing its markdown/,
    );
  });

  it('hard-fails when frontmatter is absent', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', '# no frontmatter here\n');
    expect(() => parseCapabilityIndex(repo)).toThrow(/frontmatter/);
  });

  it('hard-fails when the applies field is missing', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', '---\nname: x\nrole: griller\n---\n# x\n');
    expect(() => parseCapabilityIndex(repo)).toThrow(/missing the "applies"/);
  });

  it('hard-fails when a required subtree directory is missing', () => {
    const repo = tmp.path();
    mkdirSync(join(repo, GRILLERS), { recursive: true });
    // No pharn-review/ subtree at all.
    expect(() => parseCapabilityIndex(repo)).toThrow(/pharn-review.*missing/);
  });

  it('accepts an empty subtree (no capabilities of that role)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));
    // pharn-review exists but is empty.
    const index = parseCapabilityIndex(repo);
    expect(index.capabilities.map((c) => c.name)).toEqual(['security']);
  });
});
