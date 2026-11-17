import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { parseCapabilityIndex } from '../src/lib/capability-index.js';
import { UpstreamManifestError } from '../src/lib/upstream-manifest.js';
import {
  A11Y,
  capability,
  manifestTree,
  upstreamTree,
  withManifest,
  writeTree,
  type ManifestDoc,
  type Tree,
} from './support/harness.js';

const GRILLERS = 'pharn/pharn-pipeline/grillers';
const LENSES = 'pharn/pharn-review';

// A pharn-oss tree holding exactly `caps` (`<subtree>/<name>` → applies), plus
// the layout marker and SKILLS_VERSION the manifest needs. Capabilities come
// from pharn-install.json only (the frontmatter is never read), so `edit`
// changes what the manifest declares.
function tree(
  caps: Record<string, string>,
  edit?: (m: ManifestDoc) => void,
): Tree {
  const t: Tree = {
    SKILLS_VERSION: '7.21.0\n',
    'pharn/pharn-contracts/finding-shape.md': 'finding shape\n',
  };
  for (const [dir, applies] of Object.entries(caps)) {
    const name = dir.slice(dir.lastIndexOf('/') + 1);
    const role = dir.startsWith(GRILLERS) ? 'griller' : 'lens';
    t[`${dir}/${name}.md`] = capability(role, applies, name);
  }
  return withManifest(t, edit);
}

// Declare `applies` for one capability, whatever its markdown says.
const declare =
  (name: string, applies: unknown) =>
  (m: ManifestDoc): void => {
    m.capabilities.find((c) => c.name === name)!.applies = applies;
  };

describe('parseCapabilityIndex', () => {
  const tmp = useTmpDir();
  const index = (t: Tree) => parseCapabilityIndex(writeTree(tmp.path(), t));

  it('builds a typed index from pharn-install.json (grillers then lenses, sorted)', () => {
    const result = index(
      tree({
        [`${LENSES}/trust-fence`]: '["universal"]',
        [`${GRILLERS}/security`]: '["universal"]',
        [`${LENSES}/n-plus-one`]: '["backend", "ssr"]',
        [`${GRILLERS}/a11y`]: '["ssr", "spa"]',
      }),
    );
    expect(result.capabilities).toEqual([
      { name: 'a11y', role: 'griller', applies: ['ssr', 'spa'] },
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: ['backend', 'ssr'] },
      { name: 'trust-fence', role: 'lens', applies: 'universal' },
    ]);
  });

  it('maps ["universal"] to the string, not an array (the resolver contract)', () => {
    const [entry] = index(
      tree(
        { [`${GRILLERS}/security`]: '["universal"]' },
        declare('security', ['universal']),
      ),
    ).capabilities;
    expect(entry!.applies).toBe('universal');
  });

  it('maps universal beside an archetype to the string', () => {
    const [entry] = index(
      tree(
        { [`${GRILLERS}/security`]: '["universal"]' },
        declare('security', ['ssr', 'universal']),
      ),
    ).capabilities;
    expect(entry!.applies).toBe('universal');
  });

  it('is deterministic - identical result across repeated parses', () => {
    const repo = writeTree(
      tmp.path(),
      tree({
        [`${GRILLERS}/security`]: '["universal"]',
        [`${LENSES}/n-plus-one`]: '["backend"]',
      }),
    );
    expect(parseCapabilityIndex(repo)).toEqual(parseCapabilityIndex(repo));
  });

  it('reports an empty unknown list for a fully-parseable clone (P5: zero noise)', () => {
    const result = index(
      tree({
        [`${GRILLERS}/security`]: '["universal"]',
        [`${LENSES}/n-plus-one`]: '["backend"]',
      }),
    );
    expect(result.unknown).toEqual([]);
  });

  it('skips and reports an unknown applies token, keeping the rest of the index', () => {
    const result = index(
      tree(
        {
          [`${GRILLERS}/security`]: '["universal"]',
          [`${GRILLERS}/a11y`]: '["ssr"]',
        },
        declare('a11y', ['ssr', 'mobile']),
      ),
    );
    expect(result.capabilities).toEqual([
      { name: 'security', role: 'griller', applies: 'universal' },
    ]);
    expect(result.unknown).toHaveLength(1);
    expect(result.unknown[0]).toMatchObject({
      name: 'a11y',
      role: 'griller',
      subtree: GRILLERS,
    });
    expect(result.unknown[0]!.reason).toMatch(/mobile/);
  });

  it('reports the lens subtree role for an unparseable lens (subtree is authoritative)', () => {
    const result = index(
      tree(
        { [`${LENSES}/n-plus-one`]: '["backend"]' },
        declare('n-plus-one', ['mobile']),
      ),
    );
    expect(result.unknown).toEqual([
      expect.objectContaining({
        name: 'n-plus-one',
        role: 'lens',
        subtree: LENSES,
      }),
    ]);
  });

  it('lists unknowns deterministically: grillers before lenses, sorted within each', () => {
    const unknownAll = (m: ManifestDoc): void => {
      for (const c of m.capabilities) c.applies = ['mobile'];
    };
    const result = index(
      tree(
        {
          [`${LENSES}/beta`]: '["ssr"]',
          [`${GRILLERS}/zeta`]: '["ssr"]',
          [`${GRILLERS}/alpha`]: '["ssr"]',
        },
        unknownAll,
      ),
    );
    expect(result.unknown.map((u) => `${u.role}:${u.name}`)).toEqual([
      'griller:alpha',
      'griller:zeta',
      'lens:beta',
    ]);
  });

  it('tolerates a WHOLE subtree of unparseable capabilities without throwing', () => {
    const result = index(
      tree(
        {
          [`${GRILLERS}/one`]: '["ssr"]',
          [`${GRILLERS}/two`]: '["ssr"]',
        },
        (m) => {
          for (const c of m.capabilities) c.applies = ['mobile'];
        },
      ),
    );
    expect(result.capabilities).toEqual([]);
    expect(result.unknown).toHaveLength(2);
  });

  it('accepts an empty subtree (no capabilities of that role)', () => {
    const result = index(tree({ [`${GRILLERS}/security`]: '["universal"]' }));
    expect(result.capabilities).toEqual([
      { name: 'security', role: 'griller', applies: 'universal' },
    ]);
    expect(result.unknown).toEqual([]);
  });

  it('refuses a tree without pharn-install.json (a pharn-oss older than 7.21.0)', () => {
    const repo = writeTree(tmp.path(), upstreamTree('7.20.0'));
    expect(() => parseCapabilityIndex(repo)).toThrow(UpstreamManifestError);
    expect(() => parseCapabilityIndex(repo)).toThrow(/older than 7\.21\.0/);
  });
});

describe('parseCapabilityIndex — from pharn-install.json (CORE-194)', () => {
  const tmp = useTmpDir();

  it('indexes the manifest, not the frontmatter', () => {
    const tree = manifestTree('7.20.0', (m) => {
      m.capabilities.find((c) => c.name === 'a11y')!.applies = ['backend'];
    });
    // A markdown with no frontmatter at all: the index reads no capability
    // file, only the manifest.
    tree[A11Y] = 'no frontmatter at all\n';
    const index = parseCapabilityIndex(writeTree(join(tmp.path(), 'r'), tree));
    expect(index.capabilities).toEqual([
      { name: 'a11y', role: 'griller', applies: ['backend'] },
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: ['backend'] },
    ]);
    expect(index.unknown).toEqual([]);
  });

  it('refuses a malformed manifest instead of falling back to the frontmatter', () => {
    const tree = manifestTree('7.20.0', (m) => {
      m.capabilities[0]!.role = 'verifier';
    });
    expect(() =>
      parseCapabilityIndex(writeTree(join(tmp.path(), 'r'), tree)),
    ).toThrow(/invalid role/);
  });
});
