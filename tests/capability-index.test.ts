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

  it('enumerates the pharn/ layout when the clone uses it (marker: pharn/pharn-contracts)', () => {
    const repo = tmp.path();
    // The detection marker + both pharn/ subtree roots.
    mkdirSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
    mkdirSync(join(repo, 'pharn/pharn-pipeline/grillers'), { recursive: true });
    mkdirSync(join(repo, 'pharn/pharn-review'), { recursive: true });
    writeCap(
      repo,
      'pharn/pharn-pipeline/grillers',
      'a11y',
      fm('griller', '["ssr"]'),
    );
    writeCap(
      repo,
      'pharn/pharn-review',
      'n-plus-one',
      fm('lens', '["backend"]'),
    );

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities).toEqual([
      { name: 'a11y', role: 'griller', applies: ['ssr'] },
      { name: 'n-plus-one', role: 'lens', applies: ['backend'] },
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

  // The enum gate must survive the loosening: an unknown UNQUOTED token is still
  // REFUSED (fail-closed on installing, P2/P5) - the split validates each element
  // WHOLE. What changed is the BLAST RADIUS: the offending capability is skipped
  // and reported instead of killing the whole index.
  it('still refuses an unknown unquoted token (enum gate survives loosening)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '[ssr, mobile]'));
    const index = parseCapabilityIndex(repo);
    expect(index.capabilities).toEqual([]);
    expect(index.unknown).toHaveLength(1);
    expect(index.unknown[0]!.reason).toMatch(/mobile|invalid applies/);
  });

  it('is deterministic - identical result across repeated parses', () => {
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

  it('reports an empty unknown list for a fully-parseable clone (P5: zero noise)', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'a11y', fm('griller', '["ssr"]'));
    expect(parseCapabilityIndex(repo).unknown).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // TOLERATE AND REPORT (the forward-compatibility contract).
  //
  // These tests used to assert a THROW. The contract deliberately changed: a
  // released CLI always parses `main` HEAD and can never pin older content, so
  // one routine grammar evolution upstream used to brick init/add/update in
  // every deployed CLI at once. The posture is unchanged where it matters -
  // nothing unparseable is ever INSTALLED - but merely SEEING unknown content
  // is no longer fatal. The scope of the tolerance is WHERE the failure happens
  // (inside the per-capability loop), never an enumerated list of shapes.
  // -------------------------------------------------------------------------

  // The reason each case is skipped, and the good capability that must survive
  // alongside it in the SAME subtree.
  const SKIP_CASES: { label: string; body: string; reason: RegExp }[] = [
    {
      label: 'an invalid role',
      body: fm('auditor', '["universal"]'),
      reason: /invalid role/,
    },
    {
      label: 'a role that does not match its subtree',
      body: fm('lens', '["universal"]'),
      reason: /declares role/,
    },
    {
      label: 'an unknown applies token',
      body: fm('griller', '["mobile"]'),
      reason: /invalid applies/,
    },
    {
      label: 'universal mixed with archetypes',
      body: fm('griller', '["universal", "ssr"]'),
      reason: /mixes "universal"/,
    },
    {
      label: 'an empty applies array',
      body: fm('griller', '[]'),
      reason: /empty "applies"/,
    },
    {
      label: 'a non-array applies value',
      body: fm('griller', 'universal'),
      reason: /malformed "applies"/,
    },
    {
      label: 'no frontmatter fence',
      body: '# no frontmatter here\n',
      reason: /frontmatter/,
    },
    {
      label: 'a missing applies field (what a YAML block-list produces)',
      body: '---\nname: x\nrole: griller\n---\n# x\n',
      reason: /missing the "applies"/,
    },
    {
      label: 'a missing role field',
      body: '---\nname: x\napplies: ["universal"]\n---\n# x\n',
      reason: /missing the "role"/,
    },
  ];

  for (const { label, body, reason } of SKIP_CASES) {
    it(`skips and reports ${label}, keeping the rest of the index`, () => {
      const repo = tmp.path();
      scaffold(repo);
      writeCap(repo, GRILLERS, 'broken', body);
      writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));
      writeCap(repo, LENSES, 'trust-fence', fm('lens', '["universal"]'));

      const index = parseCapabilityIndex(repo);

      expect(index.capabilities).toEqual([
        { name: 'security', role: 'griller', applies: 'universal' },
        { name: 'trust-fence', role: 'lens', applies: 'universal' },
      ]);
      expect(index.unknown).toEqual([
        {
          name: 'broken',
          role: 'griller',
          subtree: GRILLERS,
          reason: expect.stringMatching(reason) as unknown as string,
        },
      ]);
    });
  }

  it('skips and reports a capability directory name outside the allowlist (P2)', () => {
    const repo = tmp.path();
    scaffold(repo);
    // Underscore is rejected by CAPABILITY_NAME_RE BEFORE any path-join, so the
    // name is never joined at all - it is reported and enumerated no further.
    writeCap(repo, GRILLERS, 'bad_name', fm('griller', '["universal"]'));
    writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities.map((c) => c.name)).toEqual(['security']);
    expect(index.unknown).toHaveLength(1);
    expect(index.unknown[0]!.name).toBe('bad_name');
  });

  it('skips and reports a directory with no capability markdown (the live repro)', () => {
    const repo = tmp.path();
    scaffold(repo);
    // An untracked WIP dir upstream: a shape pharn-oss's own floor validator does
    // not catch, and the exact one that killed the entire parse before this fix.
    mkdirSync(join(repo, GRILLERS, 'backwards-compat'), { recursive: true });
    writeCap(repo, GRILLERS, 'security', fm('griller', '["universal"]'));

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities.map((c) => c.name)).toEqual(['security']);
    expect(index.unknown).toEqual([
      {
        name: 'backwards-compat',
        role: 'griller',
        subtree: GRILLERS,
        reason: expect.stringMatching(
          /missing its markdown/,
        ) as unknown as string,
      },
    ]);
  });

  it('reports the lens subtree role for an unparseable lens (subtree is authoritative)', () => {
    const repo = tmp.path();
    scaffold(repo);
    // Frontmatter says `griller`; the SUBTREE says lens, and the subtree wins -
    // so the reported role is one a caller can safely build a `role:name` key from
    // even when the frontmatter role is exactly what failed.
    writeCap(repo, LENSES, 'misfiled', fm('griller', '["universal"]'));

    const index = parseCapabilityIndex(repo);
    expect(index.unknown).toEqual([
      {
        name: 'misfiled',
        role: 'lens',
        subtree: LENSES,
        reason: expect.stringMatching(/declares role/) as unknown as string,
      },
    ]);
  });

  it('lists unknowns deterministically: grillers before lenses, sorted within each', () => {
    const repo = tmp.path();
    scaffold(repo);
    mkdirSync(join(repo, GRILLERS, 'zeta'), { recursive: true });
    mkdirSync(join(repo, GRILLERS, 'alpha'), { recursive: true });
    mkdirSync(join(repo, LENSES, 'beta'), { recursive: true });

    const index = parseCapabilityIndex(repo);
    expect(index.unknown.map((u) => `${u.role}:${u.name}`)).toEqual([
      'griller:alpha',
      'griller:zeta',
      'lens:beta',
    ]);
    expect(parseCapabilityIndex(repo)).toEqual(index);
  });

  it('tolerates a WHOLE subtree of unparseable capabilities without throwing', () => {
    const repo = tmp.path();
    scaffold(repo);
    mkdirSync(join(repo, GRILLERS, 'one'), { recursive: true });
    mkdirSync(join(repo, GRILLERS, 'two'), { recursive: true });

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities).toEqual([]);
    expect(index.unknown).toHaveLength(2);
  });

  // The STRUCTURAL failure stays fatal: a missing subtree is not "one unknown
  // capability", it is a clone whose shape the CLI cannot address at all.
  it('hard-fails when a required subtree directory is missing', () => {
    const repo = tmp.path();
    mkdirSync(join(repo, GRILLERS), { recursive: true });
    // No pharn-review/ subtree at all.
    expect(() => parseCapabilityIndex(repo)).toThrow(ManifestValidationError);
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
