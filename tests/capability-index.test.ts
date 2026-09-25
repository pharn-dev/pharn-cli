import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

  it('accepts a closing fence with trailing blanks, and ignores look-alike keys', () => {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(
      repo,
      GRILLERS,
      'spaced',
      '---\nrole: griller\nroles: lens\n  applies: ["ssr"]\napplies: ["universal"]\n--- \t\n# x\n',
    );
    const index = parseCapabilityIndex(repo);
    expect(index.unknown).toEqual([]);
    expect(index.capabilities).toEqual([
      { name: 'spaced', role: 'griller', applies: 'universal' },
    ]);
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
    }, // PHARN-14: a lazy-regex fence read an EMPTY block's following BODY as
    // frontmatter. The body carries a VALID role/applies on purpose, so the base
    // source installs it (the wrong reason cannot make this pass).
    {
      label: 'an empty frontmatter block (fields only in the body)',
      body: '---\n---\nrole: griller\napplies: ["universal"]\n---\n# x\n',
      reason: /missing the "role"/,
    },
    {
      label: 'an unterminated frontmatter fence',
      body: '---\nrole: griller\napplies: ["universal"]\n# x\n',
      reason: /frontmatter block/,
    },
    // PHARN-14: upstream's validator keeps the LAST duplicate, a first-match
    // reader the FIRST — so a duplicate is refused rather than guessed.
    {
      label: 'a duplicated applies field',
      body: '---\nrole: griller\napplies: ["ssr"]\napplies: ["universal"]\n---\n# x\n',
      reason: /"applies" frontmatter field 2 times/,
    },
    {
      label: 'a duplicated role field',
      body: '---\nrole: griller\nrole: griller\napplies: ["universal"]\n---\n# x\n',
      reason: /"role" frontmatter field 2 times/,
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

  // PHARN-08: `<name>/<name>.md` present but NOT a regular file. existsSync
  // said yes, readFileSync threw EISDIR (not a ManifestValidationError), and the
  // whole index — init/add/update/status for every deployed CLI — died.
  it('skips and reports a DIRECTORY named <name>.md instead of aborting the index', () => {
    const repo = tmp.path();
    scaffold(repo);
    mkdirSync(join(repo, LENSES, 'newcap', 'newcap.md'), { recursive: true });
    writeCap(repo, LENSES, 'n-plus-one', fm('lens', '["universal"]'));

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities.map((c) => c.name)).toEqual(['n-plus-one']);
    expect(index.unknown).toEqual([
      {
        name: 'newcap',
        role: 'lens',
        subtree: LENSES,
        reason: expect.stringMatching(
          /newcap\/newcap\.md is not a regular file/,
        ) as unknown as string,
      },
    ]);
  });

  it('never follows a SYMLINKED <name>.md (it could point outside the clone)', () => {
    const repo = join(tmp.path(), 'repo');
    scaffold(repo);
    const outside = join(tmp.path(), 'outside-cap.md');
    writeFileSync(outside, fm('griller', '["universal"]'));
    mkdirSync(join(repo, GRILLERS, 'linked'), { recursive: true });
    symlinkSync(outside, join(repo, GRILLERS, 'linked', 'linked.md'));

    const index = parseCapabilityIndex(repo);
    expect(index.capabilities).toEqual([]);
    expect(index.unknown.map((u) => u.name)).toEqual(['linked']);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO <name>.md without reading it (a read would block forever)',
    () => {
      const repo = tmp.path();
      scaffold(repo);
      mkdirSync(join(repo, GRILLERS, 'piped'), { recursive: true });
      execFileSync('mkfifo', [join(repo, GRILLERS, 'piped', 'piped.md')]);

      const index = parseCapabilityIndex(repo);
      expect(index.unknown.map((u) => u.name)).toEqual(['piped']);
    },
  );

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

// F23: the fence is upstream's own rule. pharn-oss's validator (this repo's copy:
// .dev/floor/validate.mjs → parseFrontmatter) opens on a file that STARTS with
// `---` and closes at the first newline followed by `---` — any line that
// starts with it (`----`, `--- note`). A capability upstream's CI passes must
// never be skipped here for its fence.
describe("parseCapabilityIndex — the frontmatter fence is upstream's", () => {
  const tmp = useTmpDir();
  const FIELDS = 'role: griller\napplies: ["universal"]';

  // Installs `body` as the one griller and reports whether it was ACCEPTED.
  function accepted(body: string): boolean {
    const repo = tmp.path();
    scaffold(repo);
    writeCap(repo, GRILLERS, 'probe', body);
    const index = parseCapabilityIndex(repo);
    return index.capabilities.some((c) => c.name === 'probe');
  }

  it('accepts a closing ---- line', () => {
    expect(accepted(`---\n${FIELDS}\n----\n# x\n`)).toBe(true);
  });

  it('accepts a closing "--- note" line', () => {
    expect(accepted(`---\n${FIELDS}\n--- note\n# x\n`)).toBe(true);
  });

  it('closes at the FIRST such line — a later horizontal rule in the body is prose', () => {
    expect(
      accepted(`---\n${FIELDS}\n---\n# x\n\n---\n\nrole: lens\napplies: []\n`),
    ).toBe(true);
  });

  it('still refuses an empty block whose fields sit only in the body', () => {
    expect(accepted(`---\n---\n${FIELDS}\n---\n# x\n`)).toBe(false);
  });

  // The upstream parser is read out of this repo's copy of the validator, so
  // there is no second copy to drift: the day its rule changes, this test runs
  // the new one. The file runs its checks on import (it exits the process), so
  // the one function is extracted by name and built on its own.
  function upstreamParseFrontmatter(): (text: string) => {
    fm: Record<string, unknown> | null;
  } {
    const src = readFileSync(
      join(import.meta.dirname, '..', '.dev', 'floor', 'validate.mjs'),
      'utf8',
    );
    const found = src.match(
      /^function parseFrontmatter\(text\) \{\n[\s\S]*?\n\}\n/gm,
    );
    expect(found).toHaveLength(1);
    return new Function(`${found![0]}; return parseFrontmatter;`)() as (
      text: string,
    ) => { fm: Record<string, unknown> | null };
  }

  // Upstream's verdict for the two fields this CLI reads: a block exists and
  // carries a role and a non-empty applies.
  function upstreamAccepts(body: string): boolean {
    const { fm } = upstreamParseFrontmatter()(body);
    return (
      fm !== null &&
      typeof fm.role === 'string' &&
      fm.role !== '' &&
      Array.isArray(fm.applies) &&
      fm.applies.length > 0
    );
  }

  const BOM = String.fromCharCode(0xfeff);
  const SHAPES: [string, string][] = [
    ['the plain fence', `---\n${FIELDS}\n---\n# x\n`],
    ['a closing fence with trailing blanks', `---\n${FIELDS}\n--- \t\n# x\n`],
    ['a closing ----', `---\n${FIELDS}\n----\n# x\n`],
    ['a closing "--- note"', `---\n${FIELDS}\n--- note\n# x\n`],
    ['an opening ----', `----\n${FIELDS}\n---\n# x\n`],
    ['an opening "--- note"', `--- note\n${FIELDS}\n---\n# x\n`],
    [
      'a field on the opening line',
      `--- role: griller\napplies: ["universal"]\n---\n`,
    ],
    ['a body rule after the close', `---\n${FIELDS}\n---\n# x\n\n---\n`],
    ['an empty block', `---\n---\n${FIELDS}\n---\n`],
    ['an unterminated block', `---\n${FIELDS}\n# x\n`],
    ['no fence at all', `# x\n${FIELDS}\n`],
    ['a blank line before the fence', `\n---\n${FIELDS}\n---\n`],
    ['a byte-order mark before the fence', `${BOM}---\n${FIELDS}\n---\n`],
    ['a fence that is not at column 0', ` ---\n${FIELDS}\n---\n`],
  ];

  it.each(SHAPES)("gives upstream's verdict for %s", (_label, body) => {
    expect(accepted(body)).toBe(upstreamAccepts(body));
  });

  // The one named difference, and its direction. Upstream reads each line with
  // `(.*)$` and no multiline flag, so a line ending in CR yields no field and
  // its validator refuses the file — upstream never ships one. This CLI reads
  // fields with a multiline pattern, where `$` also matches before a CR, so it
  // reads them. More lenient, never less: nothing upstream ships is refused.
  it('is more lenient than upstream on CRLF, never less', () => {
    const crlf = `---\r\nrole: griller\r\napplies: ["universal"]\r\n---\r\n# x\r\n`;
    expect(upstreamAccepts(crlf)).toBe(false);
    expect(accepted(crlf)).toBe(true);
  });
});
