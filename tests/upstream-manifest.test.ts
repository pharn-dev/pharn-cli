import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  A11Y,
  MANIFEST,
  manifestTree,
  NEW_SURFACE,
  SECURITY,
  SETTINGS,
  withManifest,
  upstreamTree,
  type ManifestDoc,
  type Tree,
} from './support/harness.js';
import {
  disallowedDestMessage,
  manifestCapabilityFiles,
  manifestCapabilityIndex,
  manifestDeclaresSettings,
  manifestInstallFiles,
  MAX_MANIFEST_BYTES,
  MAX_MANIFEST_FILES,
  readUpstreamManifest,
  UpstreamManifestError,
  verifyUpstreamManifest,
} from '../src/lib/upstream-manifest.js';
import { ManifestValidationError } from '../src/lib/validate.js';

const tmp = useTmpDir();

function writeTree(tree: Tree): string {
  const dir = join(tmp.path(), 'repo');
  for (const [rel, content] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const repoWith = (edit?: (m: ManifestDoc) => void): string =>
  writeTree(manifestTree('7.20.0', edit));

function refusal(edit: (m: ManifestDoc) => void): string {
  const dir = repoWith(edit);
  try {
    readUpstreamManifest(dir);
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect(err).toBeInstanceOf(ManifestValidationError);
    return (err as Error).message;
  }
  throw new Error('expected a refusal');
}

const fileAt = (m: ManifestDoc, dest: string) => {
  const f = m.files.find((x) => x.dest === dest);
  if (!f) throw new Error(`no ${dest}`);
  return f;
};

describe('readUpstreamManifest — the one parser', () => {
  // A pharn-oss older than 7.21.0 ships no manifest; this pharn no longer
  // derives an install from such a tree.
  const absentRefusal = (tree: Tree): string => {
    try {
      readUpstreamManifest(writeTree(tree));
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamManifestError);
      return (err as Error).message;
    }
    throw new Error('expected a refusal');
  };

  it('refuses a tree without pharn-install.json, naming its version and the fix', () => {
    const message = absentRefusal(upstreamTree('7.20.0'));
    expect(message).toContain('(SKILLS_VERSION 7.20.0)');
    expect(message).toContain('ships no pharn-install.json');
    expect(message).toContain('older than 7.21.0');
    expect(message).toContain('`--ref main`');
    expect(message).toContain('Nothing was written.');
  });

  it('refuses a manifest-less tree whose SKILLS_VERSION is hostile, never quoting it', () => {
    const message = absentRefusal({
      ...upstreamTree('7.20.0'),
      SKILLS_VERSION: '\u001b[31m7.20.0\u202e\n',
    });
    expect(message).toContain('ships no pharn-install.json');
    expect(message).not.toContain('SKILLS_VERSION');
    expect(message).not.toContain('\u001b');
    expect(message).not.toContain('\u202e');
  });

  it('refuses a manifest-less tree with no SKILLS_VERSION for the missing manifest', () => {
    const { SKILLS_VERSION: _drop, ...tree } = upstreamTree('7.20.0');
    const message = absentRefusal(tree);
    expect(message).toMatch(
      /^The fetched pharn-oss ships no pharn-install\.json/,
    );
  });

  it('reads a valid manifest: capabilities, files, models.defaults', () => {
    const m = readUpstreamManifest(repoWith())!;
    expect(m.skillsVersion).toBe('7.20.0');
    expect(m.capabilities.map((c) => `${c.role}:${c.name}`)).toEqual([
      'griller:a11y',
      'griller:security',
      'lens:n-plus-one',
    ]);
    expect(m.files.find((f) => f.path === 'LICENSE')?.dest).toBe(
      'pharn/LICENSE',
    );
    expect(m.files.find((f) => f.dest === NEW_SURFACE)?.surface).toBe('skills');
    expect(m.modelsDefaults).toEqual({
      stages: {
        default: { model: 'sonnet', effort: 'high' },
        plan: { model: 'opus', effort: 'high' },
      },
    });
  });

  it('ignores unknown top-level and entry keys (additive within version 1)', () => {
    const m = readUpstreamManifest(
      repoWith((doc) => {
        doc.future = { anything: true };
        (doc.files[0] as unknown as Record<string, unknown>).extra = 1;
      }),
    );
    expect(m).not.toBeNull();
  });

  it('refuses an unknown schemaVersion, naming the upgrade and --ref main', () => {
    const msg = refusal((m) => {
      m.schemaVersion = 2;
    });
    expect(msg).toContain('schemaVersion 2');
    expect(msg).toContain('npm install -g @pharn-dev/pharn@latest');
    expect(msg).toContain('--ref main');
    expect(msg).toContain('Nothing was written');
  });

  it.each([
    ['a string schemaVersion', (m: ManifestDoc) => (m.schemaVersion = '1')],
    ['a missing schemaVersion', (m: ManifestDoc) => delete m.schemaVersion],
  ])('refuses %s', (_label, edit) => {
    expect(refusal(edit)).toContain('schemaVersion');
  });

  it('refuses a file that is not JSON, or not an object, without quoting it', () => {
    const notJson = writeTree({
      ...upstreamTree('7.20.0'),
      [MANIFEST]: '{"x": \u001b[31m',
    });
    expect(() => readUpstreamManifest(notJson)).toThrow(/is not valid JSON/);
    const array = join(tmp.path(), 'array');
    mkdirSync(array);
    writeFileSync(join(array, MANIFEST), '[]');
    expect(() => readUpstreamManifest(array)).toThrow(/is not a JSON object/);
  });

  it('refuses a manifest over the size cap, and a directory in its place', () => {
    const big = join(tmp.path(), 'big');
    mkdirSync(big);
    writeFileSync(join(big, MANIFEST), ' '.repeat(MAX_MANIFEST_BYTES + 1));
    expect(() => readUpstreamManifest(big)).toThrow(UpstreamManifestError);
    const dir = join(tmp.path(), 'dir');
    mkdirSync(join(dir, MANIFEST), { recursive: true });
    expect(() => readUpstreamManifest(dir)).toThrow(/not a regular file/);
  });

  it.each([
    ['malformed', '7.20', /invalid skillsVersion/],
    [
      'different from SKILLS_VERSION',
      '7.21.0',
      /tree's SKILLS_VERSION is 7.20.0/,
    ],
  ])('refuses a skillsVersion that is %s', (_l, value, re) => {
    expect(
      refusal((m) => {
        m.skillsVersion = value;
      }),
    ).toMatch(re);
  });

  it.each<[string, (m: ManifestDoc) => void]>([
    ['another layout name', (m) => (m.layout.name = 'flat')],
    ['another marker', (m) => (m.layout.marker = 'pharn/other')],
    [
      'another griller subtree',
      (m) =>
        (m.layout.capabilitySubtrees = {
          griller: 'pharn/grillers',
          lens: 'pharn/pharn-review',
        }),
    ],
    [
      'an extra subtree role',
      (m) =>
        (m.layout.capabilitySubtrees = {
          griller: 'pharn/pharn-pipeline/grillers',
          lens: 'pharn/pharn-review',
          verifier: 'pharn/v',
        }),
    ],
    ['no layout', (m) => delete (m as Partial<ManifestDoc>).layout],
  ])('refuses a layout with %s, naming the upgrade', (_l, edit) => {
    const msg = refusal(edit);
    expect(msg).toContain('layout this pharn does not know');
    expect(msg).toContain('Upgrade pharn');
  });

  it('refuses the pharn layout when the tree lacks its marker', () => {
    const tree = manifestTree('7.20.0');
    const dir = writeTree(
      Object.fromEntries(
        Object.entries(tree).filter(
          ([p]) => !p.startsWith('pharn/pharn-contracts/'),
        ),
      ),
    );
    expect(() => readUpstreamManifest(dir)).toThrow(
      /has no pharn\/pharn-contracts/,
    );
  });

  describe('capabilities', () => {
    it.each<[string, (m: ManifestDoc) => void, RegExp]>([
      [
        'not an array',
        (m) => (m.capabilities = {} as never),
        /no capabilities array/,
      ],
      [
        'an entry that is not an object',
        (m) => (m.capabilities[0] = 'x' as never),
        /is not an object/,
      ],
      [
        'a name outside CAPABILITY_NAME_RE',
        (m) => (m.capabilities[0]!.name = '../a11y'),
        /invalid format/,
      ],
      [
        'a name with a control character',
        (m) => (m.capabilities[0]!.name = 'a\u001b11y'),
        /control characters/,
      ],
      [
        'a role outside the enum',
        (m) => (m.capabilities[0]!.role = 'verifier'),
        /invalid role/,
      ],
      [
        'a dir that is not <subtree>/<name>',
        (m) => (m.capabilities[0]!.dir = 'pharn/elsewhere/a11y'),
        /a griller lives at/,
      ],
      [
        'a duplicate name',
        (m) =>
          m.capabilities.push({
            ...m.capabilities[0]!,
            role: 'lens',
            dir: 'pharn/pharn-review/a11y',
          }),
        /declares capability "a11y" twice/,
      ],
      [
        'an empty applies array',
        (m) => (m.capabilities[0]!.applies = []),
        /malformed applies/,
      ],
      [
        'a non-string applies token',
        (m) => (m.capabilities[0]!.applies = [1]),
        /malformed applies/,
      ],
      [
        'a scalar applies other than universal',
        (m) => (m.capabilities[0]!.applies = 'ssr'),
        /malformed applies/,
      ],
      [
        'a capability that owns no file',
        (m) =>
          m.capabilities.push({
            name: 'ghost',
            role: 'lens',
            applies: 'universal',
            dir: 'pharn/pharn-review/ghost',
          }),
        /capability "ghost" with no files/,
      ],
    ])('refuses %s', (_l, edit, re) => {
      expect(refusal(edit)).toMatch(re);
    });
  });

  describe('files', () => {
    it.each<[string, (m: ManifestDoc) => void, RegExp]>([
      ['not an array', (m) => (m.files = null as never), /no files array/],
      [
        'an entry that is not an object',
        (m) => (m.files[0] = 7 as never),
        /is not an object/,
      ],
      [
        'a path with ..',
        (m) => (m.files[0]!.path = 'pharn/../x'),
        /not a safe relative path/,
      ],
      [
        'an absolute path',
        (m) => (m.files[0]!.path = '/etc/passwd'),
        /not a safe relative path/,
      ],
      [
        'a backslash',
        (m) => (m.files[0]!.path = 'pharn\\x'),
        /not a safe relative path/,
      ],
      [
        'an empty segment',
        (m) => (m.files[0]!.dest = 'pharn//x'),
        /not a safe relative path/,
      ],
      [
        'a control character',
        (m) => (m.files[0]!.dest = 'pharn/\u0007x'),
        /not a safe relative path/,
      ],
      [
        'a non-string dest',
        (m) => (m.files[0]!.dest = 3 as never),
        /not a safe relative path/,
      ],
      [
        'a duplicate dest',
        (m) => (fileAt(m, 'pharn/LIMITS.md').dest = 'pharn/ARCHITECTURE.md'),
        /declares the dest pharn\/ARCHITECTURE.md twice/,
      ],
      [
        'an uppercase sha256',
        (m) => (m.files[0]!.sha256 = m.files[0]!.sha256.toUpperCase()),
        /malformed sha256/,
      ],
      [
        'a short sha256',
        (m) => (m.files[0]!.sha256 = 'abc'),
        /malformed sha256/,
      ],
      [
        'an unknown policy',
        (m) => (m.files[0]!.policy = 'replace'),
        /unknown policy/,
      ],
      [
        'a surface that is not a token',
        (m) => (m.files[0]!.surface = 'Hooks!'),
        /malformed surface/,
      ],
      [
        'a capability file naming no declared capability',
        (m) =>
          (m.files.find((f) => f.surface === 'capability')!.capability =
            'ghost'),
        /names no declared capability/,
      ],
      [
        'a capability file outside its dir',
        (m) => (m.files.find((f) => f.dest === A11Y)!.capability = 'security'),
        /does not lie inside pharn\/pharn-pipeline\/grillers\/security/,
      ],
      [
        'a capability file whose path differs from its dest',
        (m) =>
          (fileAt(m, A11Y).path =
            'pharn/pharn-pipeline/grillers/a11y/other.md'),
        /does not lie inside/,
      ],
      [
        'a capability field on a fixed surface',
        (m) => (fileAt(m, 'pharn/LIMITS.md').capability = 'a11y'),
        /names a capability outside the capability surface/,
      ],
    ])('refuses %s', (_l, edit, re) => {
      expect(refusal(edit)).toMatch(re);
    });

    it.each([
      ['the parent first', 0],
      ['the child first', 1],
    ])(
      "refuses a dest that is another dest's parent directory (%s)",
      (_l, order) => {
        const msg = refusal((m) => {
          const limits = fileAt(m, 'pharn/LIMITS.md');
          const pair = [
            { ...limits, dest: 'pharn/pharn-new/node' },
            { ...limits, dest: 'pharn/pharn-new/node/child.md' },
          ];
          m.files = m.files.filter((f) => f !== limits);
          m.files.push(...(order === 0 ? pair : pair.reverse()));
        });
        expect(msg).toContain(
          'declares pharn/pharn-new/node as a file and as the directory of pharn/pharn-new/node/child.md',
        );
      },
    );

    it('refuses a fixed-surface file inside a capability directory', () => {
      expect(
        refusal((m) => {
          fileAt(m, 'pharn/LIMITS.md').dest =
            'pharn/pharn-pipeline/grillers/a11y/extra.md';
        }),
      ).toContain(
        'lies inside a capability directory but is not a capability file',
      );
    });

    it('refuses more files than the extractor could ever produce', () => {
      const msg = refusal((m) => {
        m.files = Array.from(
          { length: MAX_MANIFEST_FILES + 1 },
          () => ({}) as never,
        );
      });
      expect(msg).toContain(`more than ${MAX_MANIFEST_FILES} files`);
    });
  });

  describe('the outer bound', () => {
    it.each([
      '.git/hooks/pre-commit',
      '.claude/settings.local.json',
      'README.md',
      'package.json',
      'CONSTITUTION.md',
      'pharn/memory-bank/lesson.md',
      'pharn/spec-template.md',
      'pharn/features/my-feature/SPEC.md',
      'pharn/.backup/x.md',
      '.claude/skills/my-skill/SKILL.md',
      '.claude/commands/pharn-dev-plan.md',
      '.claude/commands/Pharn-X.md',
      'src/index.ts',
    ])('refuses a dest at %s', (dest) => {
      expect(
        refusal((m) => {
          fileAt(m, 'pharn/LIMITS.md').dest = dest;
        }),
      ).toContain(`would write ${dest}, outside the paths pharn installs`);
    });

    it('names the dest, the release as the problem and the way forward', () => {
      const msg = refusal((m) => {
        fileAt(m, 'pharn/LIMITS.md').dest = 'pharn/floor/.eslintrc.json';
      });
      expect(msg).toMatch(
        /files\[\d+\] would write pharn\/floor\/\.eslintrc\.json, outside the paths pharn installs/,
      );
      expect(msg).toContain('This is a problem in the pharn-oss release');
      expect(msg).toContain('nothing in your project was changed');
      expect(msg).toContain('an existing install keeps working as it is');
      expect(msg).toContain(
        'Report it at https://github.com/pharn-dev/pharn-oss/issues',
      );
      expect(msg).toContain('re-run with --ref main');
    });

    it('escapes the dest it prints', () => {
      const msg = disallowedDestMessage('pharn/\u001b[2Kx', 'files[0]');
      expect(msg).not.toContain('\u001b');
      expect(msg).toContain('would write pharn/\\u001b[2Kx');
    });

    it('refuses a dest that escapes the project', () => {
      expect(
        refusal((m) => {
          fileAt(m, 'pharn/LIMITS.md').dest = '../x';
        }),
      ).toMatch(/not a safe relative path/);
    });

    it.each<[string, (m: ManifestDoc) => void]>([
      [
        'settings declared managed',
        (m) => (fileAt(m, SETTINGS).policy = 'managed'),
      ],
      [
        'if-absent on another file',
        (m) => (fileAt(m, 'pharn/LIMITS.md').policy = 'if-absent'),
      ],
      [
        'settings copied from another path',
        (m) => (fileAt(m, SETTINGS).path = 'pharn/LIMITS.md'),
      ],
    ])('refuses %s', (_l, edit) => {
      expect(refusal(edit)).toContain(
        'only .claude/settings.json may be copied if absent',
      );
    });

    it('accepts a new surface under a pharn-owned name, in both roots', () => {
      const m = readUpstreamManifest(
        writeTree(
          withManifest({
            ...upstreamTree('7.20.0'),
            [NEW_SURFACE]: 'skill\n',
            'pharn/pharn-new/notes/x.md': 'new\n',
          }),
        ),
      )!;
      expect(m.files.map((f) => f.dest)).toEqual(
        expect.arrayContaining([NEW_SURFACE, 'pharn/pharn-new/notes/x.md']),
      );
    });
  });

  describe('models and installRoots (type-checked only)', () => {
    it.each<[string, (m: ManifestDoc) => void, RegExp]>([
      [
        'no models object',
        (m) => delete (m as Partial<ManifestDoc>).models,
        /no models object/,
      ],
      [
        'models.rules that is not an object',
        (m) => (m.models.rules = []),
        /models.rules that is not an object/,
      ],
      [
        'installRoots that is not an object',
        (m) => (m.installRoots = 'x' as never),
        /malformed installRoots/,
      ],
      [
        'a non-string glob',
        (m) => (m.installRoots.include = [1]),
        /malformed installRoots/,
      ],
    ])('refuses %s', (_l, edit, re) => {
      expect(refusal(edit)).toMatch(re);
    });

    it('takes models.defaults as is (absent or garbage is the gate’s call) and never reads rules', () => {
      const absent = readUpstreamManifest(
        repoWith((m) => {
          delete m.models.defaults;
          delete m.models.rules;
          m.installRoots = {};
        }),
      )!;
      expect(absent.modelsDefaults).toBeUndefined();
      const odd = readUpstreamManifest(
        repoWith((m) => {
          m.models.defaults = 'not a block';
          m.models.rules = { stages: 'anything' };
        }),
      )!;
      expect(odd.modelsDefaults).toBe('not a block');
    });
  });
});

describe('verifyUpstreamManifest — raw sha256 after extraction', () => {
  it('passes a tree whose every declared file matches', () => {
    const dir = repoWith();
    expect(() =>
      verifyUpstreamManifest(dir, readUpstreamManifest(dir)!),
    ).not.toThrow();
  });

  it('refuses a file whose bytes differ, naming it', () => {
    const dir = repoWith();
    const m = readUpstreamManifest(dir)!;
    writeFileSync(join(dir, SECURITY), 'tampered\n');
    expect(() => verifyUpstreamManifest(dir, m)).toThrow(
      new RegExp(`sha256 for ${SECURITY} that its bytes do not match`),
    );
  });

  it('refuses a declared file the tree does not ship, or ships as a directory', () => {
    const missing = repoWith((m) => {
      m.files.push({
        ...fileAt(m, 'pharn/LIMITS.md'),
        path: 'pharn/floor/gone.mjs',
        dest: 'pharn/floor/gone.mjs',
      });
    });
    expect(() =>
      verifyUpstreamManifest(missing, readUpstreamManifest(missing)!),
    ).toThrow(
      /declares pharn\/floor\/gone.mjs, which the tree does not ship as a file/,
    );
    const dir = repoWith((m) => {
      m.files.push({
        ...fileAt(m, 'pharn/LIMITS.md'),
        path: 'pharn/floor',
        dest: 'pharn/floor/x.mjs',
      });
    });
    expect(() =>
      verifyUpstreamManifest(dir, readUpstreamManifest(dir)!),
    ).toThrow(/does not ship as a file/);
  });

  it('hashes RAW bytes: a CRLF file verifies against its unfolded digest only', () => {
    const tree = upstreamTree('7.20.0');
    tree['pharn/LIMITS.md'] = 'line one\r\nline two\r\n';
    const ok = writeTree(withManifest(tree));
    expect(() =>
      verifyUpstreamManifest(ok, readUpstreamManifest(ok)!),
    ).not.toThrow();
    const folded = withManifest({
      ...tree,
      'pharn/LIMITS.md': 'line one\nline two\n',
    });
    const dir = writeTree({
      ...folded,
      'pharn/LIMITS.md': tree['pharn/LIMITS.md'],
    });
    expect(() =>
      verifyUpstreamManifest(dir, readUpstreamManifest(dir)!),
    ).toThrow(/pharn\/LIMITS.md that its bytes do not match/);
  });
});

describe('projections', () => {
  it('indexes grillers then lenses by name; folds universal; an unknown token makes the capability unknown', () => {
    const m = readUpstreamManifest(
      repoWith((doc) => {
        doc.capabilities.find((c) => c.name === 'a11y')!.applies = ['mobile'];
        doc.capabilities.find((c) => c.name === 'n-plus-one')!.applies = [
          'backend',
          'universal',
        ];
        doc.capabilities.reverse();
      }),
    )!;
    const index = manifestCapabilityIndex(m);
    expect(index.capabilities).toEqual([
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: 'universal' },
    ]);
    expect(index.unknown).toEqual([
      {
        name: 'a11y',
        role: 'griller',
        subtree: 'pharn/pharn-pipeline/grillers',
        reason: expect.stringContaining('"mobile"') as string,
      },
    ]);
  });

  it('keeps an archetype list as declared', () => {
    const index = manifestCapabilityIndex(readUpstreamManifest(repoWith())!);
    expect(index.capabilities.find((c) => c.name === 'a11y')?.applies).toEqual([
      'ssr',
      'spa',
    ]);
  });

  it('install files: managed fixed files + selected capabilities, LICENSE at its dest, settings apart', () => {
    const dir = repoWith();
    const m = readUpstreamManifest(dir)!;
    const files = manifestInstallFiles(dir, m, [
      { name: 'a11y', role: 'griller' },
      { name: 'n-plus-one', role: 'griller' },
    ]);
    expect(files.has(A11Y)).toBe(true);
    expect(files.has(SECURITY)).toBe(false);
    // n-plus-one is a lens: the wrong role selects nothing.
    expect(files.has('pharn/pharn-review/n-plus-one/n-plus-one.md')).toBe(
      false,
    );
    expect(files.get('pharn/LICENSE')).toBe(join(dir, 'LICENSE'));
    expect(files.has(SETTINGS)).toBe(false);
    expect(files.has(NEW_SURFACE)).toBe(true);
    expect(manifestDeclaresSettings(m)).toBe(true);
  });

  it('capability files: the dests of one capability, sorted; the wrong role has none', () => {
    const m = readUpstreamManifest(
      writeTree(
        withManifest({
          ...upstreamTree('7.20.0'),
          'pharn/pharn-pipeline/grillers/a11y/evals/b.md': 'b\n',
        }),
      ),
    )!;
    expect(
      manifestCapabilityFiles(m, { name: 'a11y', role: 'griller' }),
    ).toEqual([A11Y, 'pharn/pharn-pipeline/grillers/a11y/evals/b.md']);
    expect(manifestCapabilityFiles(m, { name: 'a11y', role: 'lens' })).toEqual(
      [],
    );
  });

  it('declares no settings when the manifest lists none', () => {
    const m = readUpstreamManifest(
      repoWith((doc) => {
        doc.files = doc.files.filter((f) => f.dest !== SETTINGS);
      }),
    )!;
    expect(manifestDeclaresSettings(m)).toBe(false);
  });
});
