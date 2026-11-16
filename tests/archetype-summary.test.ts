import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CANCEL, useTmpDir } from './helpers.js';
import type { Archetype, Selection } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  note: vi.fn(),
  select: vi.fn(),
}));

const { archetypeOriginLines, archetypeSummaryLines, runArchetypeSummary } =
  await import('../src/steps/archetype-summary.js');
const prompts = await import('@clack/prompts');

const archetypes: Archetype[] = ['ssr'];
const selection: Selection = {
  selected: [
    { name: 'a11y', role: 'griller', matched: ['ssr'] },
    { name: 'security', role: 'griller', matched: 'universal' },
  ],
  skipped: [
    {
      name: 'migrations',
      role: 'griller',
      reason: 'applies to [backend]; archetypes [ssr]',
    },
  ],
};

describe('runArchetypeSummary', () => {
  it.each(['install', 'cancel'] as const)(
    'returns the %s action',
    async (action) => {
      vi.mocked(prompts.select).mockResolvedValue(action);
      await expect(runArchetypeSummary(archetypes, selection)).resolves.toBe(
        action,
      );
      expect(prompts.note).toHaveBeenCalled();
    },
  );

  it('returns cancel (never exits) when the prompt is cancelled', async () => {
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);
    await expect(runArchetypeSummary(archetypes, selection)).resolves.toBe(
      'cancel',
    );
  });

  it('renders detected archetypes and selected/skipped capabilities', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runArchetypeSummary(archetypes, selection);
    const note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toContain('Detected archetypes');
    expect(note).toContain('ssr');
    expect(note).toContain('a11y (griller)');
    expect(note).toContain('security (griller)');
    expect(note).toContain('universal');
    expect(note).toContain('CAPABILITIES SKIPPED (1)');
    expect(note).toContain('migrations (griller)');
  });

  // CORE-168: a capability name long enough to fill the label column used to
  // run straight into its value (`missing-error-handling (lens)universal`).
  it('keeps a gap between a long capability name and its value', () => {
    const lines = archetypeSummaryLines(archetypes, {
      selected: [
        { name: 'missing-error-handling', role: 'lens', matched: 'universal' },
      ],
      skipped: [
        {
          name: 'missing-error-handling-x',
          role: 'lens',
          reason: 'applies to [backend]; archetypes [ssr]',
        },
      ],
    });
    expect(lines).toContain('  missing-error-handling (lens)  universal');
    expect(lines).toContain(
      '  missing-error-handling-x (lens)  applies to [backend]; archetypes [ssr]',
    );
  });

  it('says why a carried-over capability is selected: added by hand', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runArchetypeSummary(archetypes, {
      selected: [{ name: 'perf', role: 'lens', matched: 'manual' }],
      skipped: [],
    });
    const note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toMatch(/perf \(lens\)\s+added by hand/);
  });

  it('omits the skipped block when nothing was skipped', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runArchetypeSummary(archetypes, {
      selected: selection.selected,
      skipped: [],
    });
    const note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).not.toContain('CAPABILITIES SKIPPED');
  });
});

// The lines alone, for `init --dry-run` and `init --yes`: the same summary the
// prompt shows, and no prompt.
describe('archetypeSummaryLines', () => {
  it('is exactly the body of the summary note, without prompting', async () => {
    vi.mocked(prompts.select).mockClear();
    const lines = archetypeSummaryLines(archetypes, selection);
    expect(prompts.select).not.toHaveBeenCalled();
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runArchetypeSummary(archetypes, selection);
    expect(vi.mocked(prompts.note).mock.calls.at(-1)![0]).toBe(
      lines.join('\n'),
    );
  });
});

// F-17: where the archetypes came from, one line per archetype. A pure function
// of plain data, so it renders the same wherever the summary is built.
describe('archetypeOriginLines', () => {
  const text = (lines: string[]): string => lines.join('\n');

  it('detected: one evidence line per archetype', () => {
    const out = text(
      archetypeOriginLines(['ssr', 'backend'], {
        kind: 'detected',
        truncated: false,
        evidence: [
          { archetype: 'ssr', source: 'dependency', name: 'next' },
          {
            archetype: 'backend',
            source: 'path',
            path: 'src/app/api/hello/route.ts',
          },
        ],
      }),
    );
    expect(out).toMatch(/Detected archetypes\s+ssr, backend/);
    expect(out).toMatch(/ssr\s+← next \(package\.json\)/);
    expect(out).toMatch(/backend\s+← src\/app\/api\/hello\/route\.ts/);
  });

  it('a devDependency is cited as one', () => {
    const out = text(
      archetypeOriginLines(['ssr'], {
        kind: 'detected',
        truncated: false,
        evidence: [
          { archetype: 'ssr', source: 'devDependency', name: '@sveltejs/kit' },
        ],
      }),
    );
    expect(out).toMatch(
      /ssr\s+← @sveltejs\/kit \(package\.json devDependencies\)/,
    );
  });

  // F-25: a walk that stopped early is said so, with the bounds and the way
  // out, in the block every text path prints (real run, --yes, dry run).
  it('detection stopped early: one line naming the bounds and --archetype', () => {
    const origin = {
      kind: 'detected' as const,
      evidence: [{ archetype: 'lib' as const, source: 'none' as const }],
    };
    const cut = text(
      archetypeOriginLines(['lib'], { ...origin, truncated: true }),
    );
    expect(cut).toContain(
      'detection stopped early: it examines at most 50,000 entries, 24 directories deep, so these archetypes may be incomplete — pass --archetype <list> if they are wrong',
    );
    expect(
      text(archetypeOriginLines(['lib'], { ...origin, truncated: false })),
    ).not.toContain('stopped early');
  });

  it('detection stopped early: not printed when --archetype replaced detection', () => {
    const out = text(
      archetypeOriginLines(['backend'], {
        kind: 'flag',
        detected: ['lib'],
        evidence: [],
        truncated: true,
      }),
    );
    expect(out).not.toContain('stopped early');
  });

  it('lib says no framework signal was found', () => {
    const out = text(
      archetypeOriginLines(['lib'], {
        kind: 'detected',
        truncated: false,
        evidence: [{ archetype: 'lib', source: 'none' }],
      }),
    );
    expect(out).toMatch(/lib\s+← no framework signal found/);
  });

  it('strips terminal control characters from an evidence path and caps it', () => {
    const out = text(
      archetypeOriginLines(['spa'], {
        kind: 'detected',
        truncated: false,
        evidence: [
          {
            archetype: 'spa',
            source: 'path',
            path: 'src/\u001b[2J\u202eEvil.tsx',
          },
        ],
      }),
    );
    expect(out).toContain('src/[2JEvil.tsx');
    expect(out).not.toContain('\u001b');
    expect(out).not.toContain('\u202e');

    const long = `src/${'a'.repeat(300)}.tsx`;
    const capped = text(
      archetypeOriginLines(['spa'], {
        kind: 'detected',
        truncated: false,
        evidence: [{ archetype: 'spa', source: 'path', path: long }],
      }),
    );
    expect(capped).toContain('…');
    expect(capped).not.toContain(long);
  });

  it('flag: names the source and the unused detection result', () => {
    const out = text(
      archetypeOriginLines(['backend'], {
        kind: 'flag',
        truncated: false,
        detected: ['ssr', 'backend'],
        evidence: [],
      }),
    );
    expect(out).toMatch(/Archetypes \(--archetype\)\s+backend/);
    expect(out).toContain('detection found ssr, backend (not used)');
    expect(out).not.toContain('Detected archetypes');
  });

  it('previously recorded: printed when the set differs, with the flag to keep it', () => {
    const out = text(
      archetypeOriginLines(
        ['ssr'],
        {
          kind: 'detected',
          truncated: false,
          evidence: [{ archetype: 'ssr', source: 'dependency', name: 'next' }],
        },
        ['ssr', 'backend'],
      ),
    );
    expect(out).toContain(
      'previously recorded: ssr, backend — pass --archetype ssr,backend to keep them',
    );
  });

  it('previously recorded: silent when the set is the same, or there is none', () => {
    const origin = {
      kind: 'detected' as const,
      truncated: false,
      evidence: [
        {
          archetype: 'ssr' as const,
          source: 'dependency' as const,
          name: 'next',
        },
        {
          archetype: 'backend' as const,
          source: 'dependency' as const,
          name: 'express',
        },
      ],
    };
    expect(
      text(
        archetypeOriginLines(['ssr', 'backend'], origin, ['backend', 'ssr']),
      ),
    ).not.toContain('previously recorded');
    expect(
      text(archetypeOriginLines(['ssr', 'backend'], origin, null)),
    ).not.toContain('previously recorded');
    expect(
      text(archetypeOriginLines(['ssr', 'backend'], origin)),
    ).not.toContain('previously recorded');
  });
});

describe('runArchetypeSummary — origin', () => {
  it('renders the origin lines in place of the bare archetype row', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runArchetypeSummary(
      ['backend'],
      selection,
      { kind: 'flag', detected: ['spa'], evidence: [], truncated: false },
      ['spa'],
    );
    const note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toContain('Archetypes (--archetype)');
    expect(note).toContain('detection found spa (not used)');
    expect(note).toContain('previously recorded: spa');
    expect(note).toContain('CAPABILITIES SELECTED');
  });
});

// A re-run init on an install that followed `main`: the new default (verified
// releases) moves it, and the summary says so — with the flag that keeps main,
// and a warning when the re-install goes BACK to an older release.
const { previousChannelLines } = await import('../src/lib/init-plan.js');

describe('previousChannelLines (re-run init, lib/init-plan.ts)', () => {
  const release = {
    kind: 'release' as const,
    tag: 'v7.1.3',
    version: '7.1.3',
  };
  const FOLLOWED =
    '    previously followed: main (the pharn-oss tip) — pass --ref main to keep it';

  it('names the move off main, with the flag to keep it', () => {
    expect(
      previousChannelLines({
        previous: { skillsVersion: '7.1.3' },
        channel: 'latest',
        explicit: false,
        source: release,
      }),
    ).toEqual([FOLLOWED]);
  });

  it('warns when the installed version is newer than the release', () => {
    expect(
      previousChannelLines({
        previous: { skillsVersion: '7.2.0' },
        channel: 'latest',
        explicit: false,
        source: release,
      }),
    ).toEqual([
      FOLLOWED,
      '    installed v7.2.0 is newer than release v7.1.3 — this re-install goes back to it',
    ]);
  });

  it.each([
    ['a first install', null, 'latest', false],
    ['an explicit --ref latest', {}, 'latest', true],
    ['--ref main', {}, 'main', true],
    ['an install already on releases', { ref: 'latest' }, 'latest', false],
  ] as const)('is silent for %s', (_, previous, channel, explicit) => {
    expect(
      previousChannelLines({ previous, channel, explicit, source: release }),
    ).toEqual([]);
  });

  it('lands in the summary right after the archetype block', () => {
    const out = archetypeSummaryLines(archetypes, selection, undefined, null, [
      FOLLOWED,
    ]);
    const at = out.indexOf(FOLLOWED);
    expect(at).toBeGreaterThan(out.findIndex((l) => l.includes('Detected')));
    expect(at).toBeLessThan(
      out.findIndex((l) => l.includes('CAPABILITIES SELECTED')),
    );
  });
});

// CORE-164: a re-run init over a config that EXISTS but cannot be read carries
// nothing over — and the summary now says so, with the reason, instead of
// dropping the manual capabilities silently.
const { firstSentence, previousConfigLines, readPreviousConfig } =
  await import('../src/lib/init-plan.js');

describe('firstSentence (the reason a thrown config error gives)', () => {
  it.each([
    ['cuts before the first sentence break', 'One. Two.', 'One'],
    ['drops a final period', 'Only one.', 'Only one'],
    ['keeps a text with no period whole', 'no period here', 'no period here'],
    [
      'never cuts inside a quoted span, escaped quotes included',
      'found "a \\". b". Rest',
      'found "a \\". b"',
    ],
    [
      'never cuts at a period inside a word',
      'pharn.config.json bad. x',
      'pharn.config.json bad',
    ],
  ])('%s', (_, text, expected) => {
    expect(firstSentence(text)).toBe(expected);
  });
});

describe('previousConfigLines (re-run init, lib/init-plan.ts)', () => {
  it('is silent when the previous config was read, or there is none', () => {
    expect(previousConfigLines({ unreadable: null })).toEqual([]);
  });

  it('names the unreadable config, its reason and the consequence, on one line', () => {
    expect(
      previousConfigLines({ unreadable: 'it is not a JSON object' }),
    ).toEqual([
      '    the previous pharn.config.json could not be read (it is not a JSON object); nothing is carried over, so manual capabilities will be dropped',
    ]);
  });

  it('lands in the summary in the re-run block, before the capabilities', () => {
    const [line] = previousConfigLines({ unreadable: 'x' });
    const out = archetypeSummaryLines(archetypes, selection, undefined, null, [
      line!,
    ]);
    const at = out.indexOf(line!);
    expect(at).toBeGreaterThan(out.findIndex((l) => l.includes('Detected')));
    expect(at).toBeLessThan(
      out.findIndex((l) => l.includes('CAPABILITIES SELECTED')),
    );
  });
});

describe('readPreviousConfig — the reason a config that exists was not read', () => {
  const tmp = useTmpDir();
  const configFile = (): string => join(tmp.path(), 'pharn.config.json');
  const writeRaw = (value: unknown): void =>
    writeFileSync(configFile(), JSON.stringify(value));
  const archetypeConfig = {
    skillsVersion: '1.0.0',
    commit: null,
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'lens', source: 'manual' }],
  };

  it('reports nothing for an absent config (a first install)', () => {
    expect(readPreviousConfig(tmp.path())).toEqual({
      fingerprint: 'absent',
      config: null,
      unreadable: null,
    });
  });

  it('reports nothing for a config it read — `modules` or not', () => {
    writeRaw(archetypeConfig);
    const previous = readPreviousConfig(tmp.path());
    expect(previous.config).toEqual(archetypeConfig);
    expect(previous.unreadable).toBeNull();
  });

  it.each([
    ['not a JSON object', [1, 2], 'it is not a JSON object'],
    [
      'missing its `skillsVersion`',
      { capabilities: [] },
      'it has no "skillsVersion" string',
    ],
    [
      'neither an archetype nor a legacy config',
      { skillsVersion: '1.0.0', modules: 'oops' },
      'it has neither a "capabilities" key nor a "modules" array',
    ],
  ])('names a config that is %s', (_, raw, reason) => {
    writeRaw(raw);
    const previous = readPreviousConfig(tmp.path());
    expect(previous.config).toBeNull();
    expect(previous.unreadable).toBe(reason);
  });

  it('names a directory at the config path', () => {
    mkdirSync(configFile());
    expect(readPreviousConfig(tmp.path()).unreadable).toBe(
      'it is not a regular file',
    );
  });

  it("keeps only a validation error's first sentence — never its advice about `pharn init`", () => {
    writeRaw({ ...archetypeConfig, capabilities: 'x' });
    expect(readPreviousConfig(tmp.path()).unreadable).toBe(
      'pharn.config.json: capabilities must be an array of {"name", "role"} entries (found "x")',
    );
    writeRaw({ ...archetypeConfig, archetypes: 'ssr' });
    expect(readPreviousConfig(tmp.path()).unreadable).toMatch(
      /^pharn\.config\.json: archetypes must be an array of .*\(found "ssr"\)$/,
    );
  });

  it('cuts an unparseable config at its first sentence too', () => {
    writeFileSync(configFile(), '{ "skillsVersion": "1.0.0", }');
    const { unreadable } = readPreviousConfig(tmp.path());
    expect(unreadable).toMatch(
      /pharn\.config\.json is not valid JSON( \(line \d+, column \d+\))?$/,
    );
    expect(unreadable).not.toContain('pharn init');
  });

  it('does not cut at a `. ` inside a quoted offender, and caps a long reason at 200 characters', () => {
    writeRaw({ ...archetypeConfig, capabilities: ['a. b'.repeat(100)] });
    const { unreadable } = readPreviousConfig(tmp.path());
    expect(unreadable).toMatch(
      /^pharn\.config\.json: capabilities\[0\] must be an object with "name" and "role" \(found "a\. ba\. b/,
    );
    expect(unreadable).toHaveLength(201);
    expect(unreadable!.endsWith('…')).toBe(true);
  });

  it('escapes an unsafe character in the reason', () => {
    const RLO = String.fromCharCode(0x202e);
    writeRaw({ ...archetypeConfig, capabilities: [RLO] });
    const { unreadable } = readPreviousConfig(tmp.path());
    expect(unreadable).toContain('(found "\\u202e")');
    expect(unreadable).not.toContain(RLO);
  });
});
