import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';

// runInstallArchetype uses clack for progress UI only — mock it so the fixture
// e2e exercises the copy + config-write apply path without a real terminal.
vi.mock('@clack/prompts', () => ({
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
  outro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { detectArchetypesFromProject } =
  await import('../src/lib/detect-archetype.js');
const { parseCapabilityIndex } = await import('../src/lib/capability-index.js');
const { resolveCapabilities } =
  await import('../src/lib/resolve-capabilities.js');
const { runInstallArchetype } =
  await import('../src/steps/install-archetype.js');
const { readPharnConfig } = await import('../src/lib/pharn-config.js');
const { DEFAULT_MODEL_ROUTING } = await import('../src/lib/model-routing.js');
const { readRecords } = await import('../src/lib/install-records.js');
const { collectExpectedInstallPaths } =
  await import('../src/lib/install-manifest.js');
const { sha256File } = await import('../src/lib/hash.js');
const prompts = await import('@clack/prompts');

// The single string runInstallArchetype passed to outro() — the same
// mocked-call read tests/status.test.ts uses for note() bodies. The outro is a
// user-visible claim surface, so its copy is pinned, not just its existence.
function outroBody(): string {
  const call = vi.mocked(prompts.outro).mock.calls.at(-1);
  return (call?.[0] as string | undefined) ?? '';
}

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function cap(role: string, applies: string): string {
  return `---\nname: c\nrole: ${role}\napplies: ${applies}\n---\n# c\n`;
}

// A fake fetched pharn-oss clone: two grillers, two lenses (one backend-only, so
// it is skipped for an ssr project), the product + dev surfaces, and the root
// SKILLS_VERSION the archetype flow reads in place of a manifest.
function scaffoldRepo(repo: string): void {
  write(
    join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["ssr", "spa"]'),
  );
  write(
    join(repo, 'pharn-pipeline/grillers/security/security.md'),
    cap('griller', '["universal"]'),
  );
  write(
    join(repo, 'pharn-review/n-plus-one/n-plus-one.md'),
    cap('lens', '["backend", "ssr"]'),
  );
  write(
    join(repo, 'pharn-review/path-traversal/path-traversal.md'),
    cap('lens', '["backend"]'),
  );
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
  write(join(repo, '.claude/hooks/enforce-writes-scope.cjs'), 'hook');
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
  write(join(repo, '.dev/floor/validate.mjs'), 'floor');
  write(join(repo, '.dev/features/x/PLAN.md'), 'DEVPLAN');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
}

describe('archetype install (fixture e2e)', () => {
  const tmp = useTmpDir();

  it('detect → resolve → install: correct capabilities, dev-only excluded, config written', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    // Fixture project: a Next.js app → archetype ssr.
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    expect(archetypes).toEqual(['ssr']);

    const index = parseCapabilityIndex(repo);
    const selection = resolveCapabilities(archetypes, index);
    // ssr selects: a11y (ssr), security (universal), n-plus-one (ssr). Skips the
    // backend-only path-traversal lens — the headline invariant.
    expect(selection.selected.map((c) => c.name).sort()).toEqual([
      'a11y',
      'n-plus-one',
      'security',
    ]);
    expect(selection.skipped.map((c) => c.name)).toEqual(['path-traversal']);

    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    // Selected capabilities installed; the skipped backend-only lens is absent.
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, 'pharn-review/n-plus-one/n-plus-one.md')),
    ).toBe(true);
    expect(existsSync(join(proj, 'pharn-review/path-traversal'))).toBe(false);

    // Product command present; dev-only command + feature tree excluded.
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(true);
    expect(existsSync(join(proj, '.claude/commands/pharn-dev-plan.md'))).toBe(
      false,
    );
    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, '.dev/features'))).toBe(false);

    // pharn.config.json written with the archetype fields.
    const config = readPharnConfig(proj);
    expect(config).not.toBeNull();
    expect(config!.archetypes).toEqual(['ssr']);
    expect(config!.skillsVersion).toBe('1.0.0');
    expect(config!.commit).toBe('sha123');
    expect(config!.modules).toEqual([]);
    expect(config!.constitution).toBeUndefined();
    // Model routing written on every fresh install (archetype path too).
    expect(config!.models).toEqual(DEFAULT_MODEL_ROUTING);
    // The spend-safe default: review resolves to opus-4-8/high, not fable-5/max.
    expect(config!.models?.stages.review).toEqual({
      model: 'opus-4-8',
      effort: 'high',
    });
    // The outro still RENDERS the routing it just wrote...
    const outro = outroBody();
    expect(outro).toContain('Models per stage');
    expect(outro).toContain('review');
    // ...but no longer invites an edit that would change which model a stage
    // runs: nothing installed reads models.stages yet. Both directions are
    // pinned — the old promise gone AND the honest replacement present — so a
    // later copy edit cannot quietly re-promise the effect with the test green.
    expect(outro).not.toContain('Change per-stage routing anytime');
    expect(outro).toContain('no installed stage reads it yet');
    // Everything a fresh install writes came from archetype resolution, so it is
    // `auto` — update owns it. Only `pharn add` writes `manual`.
    expect(config!.capabilities).toEqual([
      { name: 'a11y', role: 'griller', source: 'auto' },
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'auto' },
    ]);
  });

  // A fresh install MUST leave a record for every file it wrote. Without it the
  // very first `pharn update` finds no baseline, labels everything
  // `unverifiable`, and stops updating anything — the feature's headline
  // guarantee turned inside out.
  it('records a hash for EVERY file the install wrote, stamped to match the config', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;

    // Exactly the install manifest — nothing missing, nothing invented.
    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection.selected.map((c) => ({
        name: c.name,
        role: c.role,
      })),
      layout: 'flat',
    });
    expect(Object.keys(read.store.files).sort()).toEqual(
      [...expected.keys()].sort(),
    );

    // Each hash describes the bytes that actually LANDED (the dest), which is
    // what makes the record un-fakeable by a bad source read.
    for (const rel of expected.keys()) {
      expect(read.store.files[rel]).toBe(sha256File(join(proj, rel)));
    }

    // The stamp matches the config written beside it — that pairing is what
    // detects a store some other tool left behind.
    const config = readPharnConfig(proj)!;
    expect(read.store.skillsVersion).toBe(config.skillsVersion);
    expect(read.store.commit).toBe(config.commit);
  });

  it('does not record the user-owned .claude/settings.json', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(proj, 'package.json'), '{}');

    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.store.files['.claude/settings.json']).toBeUndefined();
    // ...even though the install DID write it.
    expect(existsSync(join(proj, '.claude/settings.json'))).toBe(true);
  });

  // THE LIVE REPRO, end to end on a real fixture tree. An untracked WIP directory
  // upstream (no markdown) is a shape pharn-oss's own floor validator does not
  // catch — and before the forward-compatibility contract it aborted the whole
  // install. It must now be skipped and reported, its bytes never copied, while
  // everything else installs exactly as before.
  it('an md-less upstream directory is skipped, reported, and NEVER copied', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    // The WIP dir, with a real file under it so "nothing was copied" is a claim
    // about the fix rather than about an empty directory.
    write(
      join(repo, 'pharn-pipeline/grillers/backwards-compat/NOTES.md'),
      'WIP',
    );
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    const index = parseCapabilityIndex(repo);

    expect(index.unknown).toEqual([
      {
        name: 'backwards-compat',
        role: 'griller',
        subtree: 'pharn-pipeline/grillers',
        reason: expect.stringMatching(
          /missing its markdown/,
        ) as unknown as string,
      },
    ]);
    expect(index.capabilities.map((c) => c.name).sort()).toEqual([
      'a11y',
      'n-plus-one',
      'path-traversal',
      'security',
    ]);

    const selection = resolveCapabilities(archetypes, index);
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    // The good capabilities landed...
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    // ...and NOTHING under the unparseable directory did (fail closed on
    // installing), nor is it recorded in pharn.config.json.
    expect(
      existsSync(join(proj, 'pharn-pipeline/grillers/backwards-compat')),
    ).toBe(false);
    expect(
      readPharnConfig(proj)!.capabilities!.map((c) => c.name),
    ).not.toContain('backwards-compat');
  });
});
