import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CANCEL, stubProcessExit, useTmpDir } from './helpers.js';

// The stage confirms via lib/confirm.js → @clack/prompts. Mock the prompt surface;
// conflictingWriteTargets + detectLayout run for real over the fake repo/proj.
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  log: { info: vi.fn(), warn: vi.fn() },
}));

const prompts = await import('@clack/prompts');
const { confirmWriteTargets, MAX_LISTED } =
  await import('../src/steps/overwrite-check.js');
const { installCapabilities } =
  await import('../src/lib/install-capabilities.js');
type Selection = import('../src/types.js').Selection;
const { readPharnConfig } = await import('../src/lib/pharn-config.js');
const { SeamConfigError } = await import('../src/lib/seam-config.js');
const { sha256File } = await import('../src/lib/hash.js');

// ESC built from its code point, so no literal control character lives in this
// file and no editor can silently eat it.
const ESC = String.fromCharCode(27);

// pharn.config.json fixtures for the recorded-version banner. The broken ones
// are raw strings so they are exactly what a hand-edit leaves behind.
const CONFIG_2_3_4 = '{"skillsVersion":"2.3.4","modules":[]}';
const CONFIG_TRUNCATED = '{"skillsVersion":';
// readPharnConfig THROWS SeamConfigError on this one (unknown step) — the exact
// class of config `init` has to stay able to repair.
const CONFIG_BAD_SEAM =
  '{"skillsVersion":"2.3.4","modules":[],"seam":{"resolutionOrder":["guess","ask"]}}';
// Valid JSON (stringify escapes the ESC), so JSON.parse SUCCEEDS and it is
// VERSION_RE, not the parse guard, that drops the value.
const CONFIG_ESCAPED_VERSION = JSON.stringify({
  skillsVersion: `2.3.4${ESC}[31mRED`,
  modules: [],
});

// The warning the stage most recently emitted. Each test resets the mock, so
// there is exactly one — but reading the LAST call keeps the helper honest if a
// future case emits two.
function lastWarning(): string {
  const calls = vi.mocked(prompts.log.warn).mock.calls;
  return calls[calls.length - 1]![0] as string;
}

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function scaffoldRepo(repo: string): void {
  write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn-pipeline/grillers/a11y/evals/cases/c.md'));
  write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/commands/pharn-ship.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'));
  write(join(repo, 'ARCHITECTURE.md'));
  write(join(repo, 'THREAT-MODEL.md'));
  write(join(repo, 'LIMITS.md'));
  write(join(repo, 'pharn-contracts/finding-shape.md'));
  write(join(repo, '.dev/floor/validate.mjs'));
}

function scaffoldRepoPharn(repo: string): void {
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'pharn/CONSTITUTION.md'));
  write(join(repo, 'pharn/ARCHITECTURE.md'));
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
  write(join(repo, 'pharn/floor/validate.mjs'));
}

function selection(): Selection {
  return {
    selected: [
      { name: 'a11y', role: 'griller', matched: ['ssr'] },
      { name: 'n-plus-one', role: 'lens', matched: ['ssr'] },
    ],
    skipped: [],
  };
}

describe('confirmWriteTargets', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  function dirs(scaffold: (r: string) => void): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffold(repo);
    vi.mocked(prompts.confirm).mockReset();
    vi.mocked(prompts.log.warn).mockReset();
    return { repo, proj };
  }

  it('returns true with NO prompt for a conflict-free project (zero friction)', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'proceed',
    );
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
  });

  it('stays silent for a project with ONLY .claude/settings.json', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, '.claude/settings.json'), '{"user":"cfg"}');
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'proceed',
    );
    expect(prompts.confirm).not.toHaveBeenCalled();
  });

  it('warns listing the conflicting path and returns the confirm result', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'CONSTITUTION.md'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'proceed',
    );
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('already exist and may be overwritten');
    expect(warning).toContain('CONSTITUTION.md');
  });

  it('a declined confirm (default No) returns `decline` — the caller cancels', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), '{}');
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'decline',
    );
  });

  it('never exits the process on any path', async () => {
    // A static guard on the contract this refactor exists to establish: the
    // three outcomes are values, and `decline` and `cancel` are DISTINCT even
    // though init treats both as cancelled — collapsing them back to a boolean
    // is exactly how the exit crept in.
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), '{}');
    for (const [answer, expected] of [
      [true, 'proceed'],
      [false, 'decline'],
      [CANCEL, 'cancel'],
    ] as const) {
      vi.mocked(prompts.confirm).mockResolvedValue(answer as never);
      await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
        expected,
      );
    }
  });

  it('a cancelled prompt (Ctrl+C) RETURNS `cancel` — it must not exit', async () => {
    // The whole point of the three-state return. Exiting from here terminates
    // the process from inside init's suspended `try`, so the
    // `finally { repo.cleanup() }` never runs and the multi-megabyte temp clone
    // is orphaned — Node does not run `finally` on process.exit. The caller
    // owns the exit, and it takes it AFTER the finally.
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), '{}');
    vi.mocked(prompts.confirm).mockResolvedValue(CANCEL as never);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'cancel',
    );
  });

  it(`caps the list at ${MAX_LISTED} with "…and N more"`, async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    // A full real install into proj makes every manifest path a conflict (>10).
    installCapabilities(repo, proj, selection());
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('…and');
    expect(warning).toContain('more');
    // Exactly MAX_LISTED bullet lines are shown.
    expect(warning.split('\n').filter((l) => l.includes('•')).length).toBe(
      MAX_LISTED,
    );
  });

  it('respects the pharn/ layout (lists paths under pharn/)', async () => {
    const { repo, proj } = dirs(scaffoldRepoPharn);
    write(join(proj, 'pharn/CONSTITUTION.md'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('pharn/CONSTITUTION.md');
  });

  // --- the recorded skillsVersion banner (init re-run orientation) ---------
  // The deleted confirmOverwriteIfExists showed the version you were about to
  // overwrite; confirmWriteTargets restores it. Every case below also asserts
  // the PINNED copy survives — the version is a prefix, never a replacement.

  it('names the recorded skillsVersion when pharn.config.json is a conflict', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), CONFIG_2_3_4);
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'proceed',
    );
    const warning = lastWarning();
    expect(warning).toContain('skills v2.3.4');
    expect(warning).toContain('already exist and may be overwritten');
    expect(warning).toContain('pharn.config.json');
  });

  it('renders the prompt on an UNPARSEABLE pharn.config.json instead of aborting', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), CONFIG_TRUNCATED);
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'decline',
    );
    const warning = lastWarning();
    expect(warning).toContain('already exist and may be overwritten');
    expect(warning).not.toContain('skills v');
  });

  it('survives a config readPharnConfig would REJECT — init is the repair command', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), CONFIG_BAD_SEAM);
    // Two-sided on purpose: prove the fixture really IS the dangerous class
    // before claiming the stage survives it. readPharnConfig lets
    // SeamConfigError PROPAGATE by design (lib/pharn-config.ts), and init has
    // no recovery around this stage — so an unguarded read here would make the
    // one command that repairs a broken config abort on it instead.
    expect(() => readPharnConfig(proj)).toThrow(SeamConfigError);
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      'proceed',
    );
    expect(lastWarning()).toContain('skills v2.3.4');
  });

  it('drops a skillsVersion that is not a plain version string', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), CONFIG_ESCAPED_VERSION);
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    const warning = lastWarning();
    expect(warning).not.toContain('skills v');
    expect(warning).not.toContain(ESC);
    expect(warning).toContain('already exist and may be overwritten');
  });

  it('shows no version when pharn.config.json is not among the conflicts', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'CONSTITUTION.md'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    expect(lastWarning()).not.toContain('skills v');
  });
});

// PHARN-11: with hundreds of existing paths capped at MAX_LISTED, the user's
// EDITS were buried in "…and N more". They are listed first, marked, and the
// prompt says they will be backed up before being overwritten.
//
// What counts as backed up is `update`'s definition (lib/dest-drift.ts): only
// "your edits" when the records show the file changed since pharn wrote it; a
// file still at its recorded hash is a clean upgrade and is not marked at all;
// with no usable records the prompt says it cannot tell.
describe('confirmWriteTargets — edited files first (PHARN-11)', () => {
  const tmp = useTmpDir();
  const sel: Selection = {
    selected: [
      { name: 'a11y', role: 'griller', matched: ['ssr'] },
      { name: 'n-plus-one', role: 'lens', matched: ['ssr'] },
    ],
    skipped: [],
  };
  const NPO = 'pharn-review/n-plus-one/n-plus-one.md';

  function firstListed(warning: string): string | undefined {
    return warning.split('\n').find((l) => l.trimStart().startsWith('•'));
  }

  // Everything installed from `repo` into `proj`, and the records a real
  // install would have written for it (every file at its installed hash).
  function installed(): {
    repo: string;
    proj: string;
    records: Record<string, string>;
  } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    installCapabilities(repo, proj, sel);
    const records: Record<string, string> = {};
    for (const rel of [
      NPO,
      'pharn-pipeline/grillers/a11y/a11y.md',
      'CONSTITUTION.md',
    ]) {
      records[rel] = sha256File(join(proj, rel));
    }
    vi.mocked(prompts.confirm).mockResolvedValueOnce(false);
    return { repo, proj, records };
  }

  it('with NO records: lists the differing file first and says it cannot tell whose change it is', async () => {
    const { repo, proj } = installed();
    // `z…` would sort LAST alphabetically.
    write(join(proj, NPO), 'MY EDIT');

    await confirmWriteTargets(repo, proj, sel);

    const warning = lastWarning();
    expect(firstListed(warning)).toContain(`${NPO} (differs from upstream)`);
    expect(warning).toContain(
      '1 of them differs from upstream — pharn has no record to tell your edits from upstream changes.',
    );
    expect(warning).toContain('It will be copied to .pharn-backup/');
    expect(warning).not.toContain('(edited)');
  });

  it('with records: a file changed since pharn wrote it is "(edited)"', async () => {
    const { repo, proj, records } = installed();
    write(join(proj, NPO), 'MY EDIT');

    await confirmWriteTargets(repo, proj, sel, { records });

    const warning = lastWarning();
    expect(firstListed(warning)).toContain(`${NPO} (edited)`);
    expect(warning).toContain(
      '1 of them changed since pharn wrote it (your edits).',
    );
  });

  it('with records: a differing file with no record is "(no pharn record)"', async () => {
    const { repo, proj, records } = installed();
    write(join(proj, 'CONSTITUTION.md'), 'SOMEONE ELSES CONSTITUTION');
    const { 'CONSTITUTION.md': _dropped, ...withoutIt } = records;

    await confirmWriteTargets(repo, proj, sel, { records: withoutIt });

    const warning = lastWarning();
    expect(firstListed(warning)).toContain('CONSTITUTION.md (no pharn record)');
    expect(warning).toContain(
      '1 of them differs from upstream, and pharn has no record of it.',
    );
  });

  it('with records: an upstream change to a file still at its record is a clean upgrade — not marked, no backup line', async () => {
    const { repo, proj, records } = installed();
    // Upstream moved on; the project still holds exactly what pharn wrote.
    write(join(repo, NPO), 'upstream v2');

    await confirmWriteTargets(repo, proj, sel, { records });

    // NPO differs from upstream, so any label would put it FIRST, marked.
    const warning = lastWarning();
    expect(firstListed(warning)).not.toContain(NPO);
    expect(warning).not.toContain('(edited)');
    expect(warning).not.toContain('(differs from upstream)');
    expect(warning).not.toContain('.pharn-backup/');
  });

  it("groups the labels in update's order and counts every backed-up file", async () => {
    const { repo, proj, records } = installed();
    write(join(proj, NPO), 'MY EDIT');
    write(join(proj, 'CONSTITUTION.md'), 'SOMEONE ELSES CONSTITUTION');
    const { 'CONSTITUTION.md': _dropped, ...withoutIt } = records;

    await confirmWriteTargets(repo, proj, sel, { records: withoutIt });

    const warning = lastWarning();
    const bullets = warning
      .split('\n')
      .filter((l) => l.trimStart().startsWith('•'));
    expect(bullets[0]).toContain(`${NPO} (edited)`);
    expect(bullets[1]).toContain('CONSTITUTION.md (no pharn record)');
    expect(warning).toContain('All 2 will be copied to .pharn-backup/');
  });

  it("compares the mapped PHARN-LICENSE with the clone's LICENSE", async () => {
    const { repo, proj } = installed();
    write(join(repo, 'LICENSE'), 'APACHE-2.0');
    write(join(proj, 'PHARN-LICENSE'), 'MY EDITED LICENSE');

    await confirmWriteTargets(repo, proj, sel);

    expect(firstListed(lastWarning())).toContain(
      'PHARN-LICENSE (differs from upstream)',
    );
  });

  it('uses the manifest it is GIVEN instead of building its own', async () => {
    const { repo, proj } = installed();
    // Only the given map names `extra.md`, so only a prompt over THAT map
    // lists it.
    write(join(proj, 'extra.md'), 'MINE');
    const manifest = new Map([['extra.md', join(repo, 'CONSTITUTION.md')]]);

    await confirmWriteTargets(repo, proj, sel, { manifest });

    const warning = lastWarning();
    expect(firstListed(warning)).toContain('extra.md (differs from upstream)');
    expect(warning).not.toContain(NPO);
  });

  it('calls nothing an edit when every existing file is byte-identical', async () => {
    const { repo, proj } = installed();

    await confirmWriteTargets(repo, proj, sel);

    expect(lastWarning()).not.toContain('(edited)');
    expect(lastWarning()).not.toContain('(differs from upstream)');
    expect(lastWarning()).not.toContain('.pharn-backup/');
  });
});
