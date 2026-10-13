import {
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';

// `pharn init --dry-run`: the real steps against a fixture clone — detect,
// fetch, MIN_CLI, index, selection, manifest, pre-flight, drift scan — and NO
// write. Every write function is wrapped in a pass-through spy so a case can
// prove none was reached, and a whole-tree snapshot proves nothing changed.

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(async () => 'install'),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

const fetchRepo = vi.fn();
const cleanup = vi.fn();
vi.mock('../src/lib/repo.js', () => ({
  fetchRepo: async (source: unknown) => ({
    source,
    ...(await fetchRepo(source)),
  }),
}));
vi.mock('../src/lib/release.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/release.js')>(
    '../src/lib/release.js',
  )),
  resolveSource: vi.fn(async () => ({ kind: 'main' as const })),
}));

// Pass-through spies on every function that writes into the project.
const createBackup = vi.fn();
vi.mock('../src/lib/backup.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/backup.js')>(
    '../src/lib/backup.js',
  );
  createBackup.mockImplementation(actual.createBackup);
  return { ...actual, createBackup };
});
const installCapabilities = vi.fn();
vi.mock('../src/lib/install-capabilities.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/install-capabilities.js')
  >('../src/lib/install-capabilities.js');
  installCapabilities.mockImplementation(actual.installCapabilities);
  return { ...actual, installCapabilities };
});
const writeRecords = vi.fn();
vi.mock('../src/lib/install-records.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/install-records.js')
  >('../src/lib/install-records.js');
  writeRecords.mockImplementation(actual.writeRecords);
  return { ...actual, writeRecords };
});
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/pharn-config.js')
  >('../src/lib/pharn-config.js');
  writePharnConfig.mockImplementation(actual.writePharnConfig);
  return { ...actual, writePharnConfig };
});
const withProjectLock = vi.fn();
vi.mock('../src/lib/project-lock.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/project-lock.js')
  >('../src/lib/project-lock.js');
  withProjectLock.mockImplementation(actual.withProjectLock);
  return { ...actual, withProjectLock };
});

const { runInit } = await import('../src/commands/init.js');
const prompts = await import('@clack/prompts');
const { BACKUP_DIR } = await import('../src/lib/backup.js');

const ESC = String.fromCharCode(27);

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function cap(role: string, applies: string): string {
  return `---\nname: c\nrole: ${role}\napplies: ${applies}\n---\n# c\n`;
}

const UPSTREAM_SETTINGS = {
  hooks: {
    Stop: [
      {
        hooks: [
          { type: 'command', command: 'node', args: ['.claude/hooks/x.cjs'] },
        ],
      },
    ],
  },
};

function fixture(root: string): { repo: string; proj: string } {
  const repo = join(root, 'repo');
  const proj = join(root, 'proj');
  write(
    join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["ssr", "spa"]'),
  );
  write(
    join(repo, 'pharn-pipeline/grillers/security/security.md'),
    cap('griller', '["universal"]'),
  );
  write(
    join(repo, 'pharn-review/path-traversal/path-traversal.md'),
    cap('lens', '["backend"]'),
  );
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/hooks/x.cjs'), 'hook');
  write(join(repo, '.claude/settings.json'), JSON.stringify(UPSTREAM_SETTINGS));
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'LICENSE'), 'Apache-2.0');
  write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
  write(join(repo, '.dev/floor/validate.mjs'), 'floor');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
  write(
    join(proj, 'package.json'),
    JSON.stringify({ dependencies: { next: '14.0.0' } }),
  );
  mkdirSync(join(proj, '.git'));
  return { repo, proj };
}

async function init(
  repo: string,
  proj: string,
  opts: Parameters<typeof runInit>[0] = {},
): Promise<void> {
  fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(proj);
  try {
    await runInit(opts);
  } finally {
    cwd.mockRestore();
  }
}

function notes(title: string): string[] {
  return vi
    .mocked(prompts.note)
    .mock.calls.filter((c) => c[1] === title)
    .map((c) => stripVTControlCharacters(String(c[0])));
}

function logged(fn: 'info' | 'warn'): string {
  return vi
    .mocked(prompts.log[fn])
    .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

function outro(): string {
  return stripVTControlCharacters(
    String(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0] ?? ''),
  );
}

function noWriteReached(): void {
  expect(createBackup).not.toHaveBeenCalled();
  expect(installCapabilities).not.toHaveBeenCalled();
  expect(writeRecords).not.toHaveBeenCalled();
  expect(writePharnConfig).not.toHaveBeenCalled();
  expect(withProjectLock).not.toHaveBeenCalled();
  expect(prompts.select).not.toHaveBeenCalled();
  expect(prompts.confirm).not.toHaveBeenCalled();
}

describe('pharn init --dry-run', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  describe('a fresh project', () => {
    // Off a TTY: a preview prompts nothing, so it has nothing to gate.
    beforeEach(() => setTTY(undefined, undefined));

    it('previews the install, writes nothing, and needs no terminal', async () => {
      const { repo, proj } = fixture(tmp.path());
      const before = [snapshotTree(proj), snapshotTree(repo)];

      await init(repo, proj, { dryRun: true });

      expect([snapshotTree(proj), snapshotTree(repo)]).toEqual(before);
      noWriteReached();
      expect(cleanup).toHaveBeenCalledTimes(1);

      const plan = notes('PLAN');
      expect(plan).toHaveLength(1);
      expect(plan[0]).toContain(
        'Nothing in your project would be overwritten.',
      );
      expect(plan[0]).toMatch(/WOULD CREATE \d+ file\(s\)/);
      expect(plan[0]).toContain('pharn.config.json');
      expect(plan[0]).toContain('`pharn init --yes` would install');
      expect(outro()).toMatch(
        /^Dry run — would create \d+ · overwrite 0 · back up 0\. Nothing was changed\./,
      );
    });

    it('shows the same summary the interactive run asks about', async () => {
      const { repo, proj } = fixture(tmp.path());
      await init(repo, proj, { dryRun: true });
      const summary = vi
        .mocked(prompts.note)
        .mock.calls.map((c) => String(c[0]))
        .find((b) => b.includes('PHARN Install Summary'));
      expect(summary).toBeDefined();
      expect(summary).toContain('a11y (griller)');
      expect(summary).toContain('path-traversal (lens)');
    });
  });

  describe('over an existing install', () => {
    beforeEach(() => setTTY(true, true));

    it('marks exactly the files a real run backs up, and backs up none itself', async () => {
      const { repo, proj } = fixture(tmp.path());
      await init(repo, proj);
      // An edit to a file pharn recorded, and a file of the user's at a path
      // the install writes that pharn has no record of.
      write(join(proj, '.claude/commands/pharn-plan.md'), 'my edit');
      write(join(repo, 'pharn-contracts/new.md'), 'upstream new');
      write(join(proj, 'pharn-contracts/new.md'), 'mine');
      vi.clearAllMocks();

      const before = snapshotTree(proj);
      await init(repo, proj, { dryRun: true });
      expect(snapshotTree(proj)).toEqual(before);
      noWriteReached();

      const plan = notes('PLAN')[0]!;
      expect(plan).toContain('.claude/commands/pharn-plan.md (edited)');
      expect(plan).toContain('pharn-contracts/new.md (no pharn record)');
      // The two drifted files, plus the config init rewrites (F-08).
      expect(plan).toContain(
        'pharn.config.json (will be rewritten — backed up first)',
      );
      expect(plan).toContain('WOULD BACK UP 3 file(s)');
      expect(plan).toContain(
        'The existing pharn.config.json would be rewritten (seam and models reset to their defaults)',
      );
      expect(plan).toContain('`pharn init --yes` would refuse');
      // Labelled files are listed first.
      expect(plan.indexOf('(edited)')).toBeLessThan(
        plan.indexOf('pharn.config.json'),
      );

      // Parity: the real run backs up exactly those three files.
      await init(repo, proj);
      const backups = readdirSync(join(proj, BACKUP_DIR));
      expect(backups).toHaveLength(1);
      expect(
        existsSync(
          join(proj, BACKUP_DIR, backups[0]!, '.claude/commands/pharn-plan.md'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(proj, BACKUP_DIR, backups[0]!, 'pharn-contracts/new.md'),
        ),
      ).toBe(true);
      expect(createBackup).toHaveBeenCalledWith(proj, [
        '.claude/commands/pharn-plan.md',
        'pharn-contracts/new.md',
        'pharn.config.json',
      ]);
    });

    it('names the hand-added capability it would keep, and the user keys it would carry, terminal-safe', async () => {
      const { repo, proj } = fixture(tmp.path());
      write(
        join(proj, 'pharn.config.json'),
        JSON.stringify({
          pharnVersion: '0.1.0',
          skillsVersion: '1.0.0',
          repo: 'pharn-dev/pharn-oss',
          commit: null,
          installedAt: '2026-01-01T00:00:00.000Z',
          modules: [],
          archetypes: ['ssr'],
          capabilities: [
            { name: 'path-traversal', role: 'lens', source: 'manual' },
          ],
          testResults: { ok: true },
          [`k${ESC}[31m`]: 1,
        }),
      );
      await init(repo, proj, { dryRun: true });
      expect(logged('info')).toContain(
        'Keeping 1 capability you added by hand: lens:path-traversal.',
      );
      const plan = notes('PLAN')[0]!;
      expect(plan).toContain('testResults');
      expect(plan).not.toContain(ESC);
    });
  });

  describe('an existing .claude/settings.json', () => {
    beforeEach(() => setTTY(true, true));

    it('says it would be preserved, and prints the HOOKS note a real run prints', async () => {
      const { repo, proj } = fixture(tmp.path());
      write(join(proj, '.claude/settings.json'), '{"hooks":{}}');

      await init(repo, proj, { dryRun: true });
      const preview = notes('HOOKS');
      expect(preview).toHaveLength(1);
      expect(notes('PLAN')[0]).toContain(
        'Would preserve the existing .claude/settings.json',
      );
      expect(preview[0]).toContain('pharn status --strict');

      vi.clearAllMocks();
      await init(repo, proj);
      expect(notes('HOOKS')).toEqual(preview);
    });
  });

  describe('refusals exit 1 as in a real run', () => {
    beforeEach(() => setTTY(undefined, undefined));

    it('refuses a project whose .claude/commands is a symlink — nothing written', async () => {
      const { repo, proj } = fixture(tmp.path());
      const outside = join(tmp.path(), 'outside');
      mkdirSync(outside);
      mkdirSync(join(proj, '.claude'));
      symlinkSync(outside, join(proj, '.claude/commands'));
      const before = [snapshotTree(proj), snapshotTree(outside)];

      const err = await init(repo, proj, { dryRun: true }).catch((e) => e);
      expect(err).toBeInstanceOf(ProcessExit);
      expect((err as ProcessExit).code).toBe(1);
      expect([snapshotTree(proj), snapshotTree(outside)]).toEqual(before);
      expect(cleanup).toHaveBeenCalledTimes(1);
      noWriteReached();
    });

    it('refuses a too-old CLI (MIN_CLI) — exit 1, clone cleaned up', async () => {
      const { repo, proj } = fixture(tmp.path());
      write(join(repo, 'MIN_CLI'), '999.0.0\n');
      const err = await init(repo, proj, { dryRun: true }).catch((e) => e);
      expect(err).toBeInstanceOf(ProcessExit);
      expect((err as ProcessExit).code).toBe(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(notes('PLAN')).toEqual([]);
    });
  });
});
