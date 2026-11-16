import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import {
  AGENT,
  REPO_DIR,
  at,
  CONSTITUTION,
  HOOK_SETTINGS,
  installFresh,
  PHARN_GITIGNORE_BLOCK,
  projectFiles,
  read,
  rootEntries,
  run,
  serveTip,
  SHA_V1,
  upstreamTree7,
  useHarness,
} from '../support/harness.js';
import { runUninstall } from '../../src/commands/uninstall.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

describe('pharn uninstall, end to end', () => {
  it('uninstall --yes deletes what the records prove — the settings.json init wrote included — and keeps edits', async () => {
    await installFresh();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();

    // Left: the edited file and the backup of the config uninstall removed.
    // Everything else pharn wrote is gone, the directories it emptied
    // included — `.claude/` too, since the settings.json init wrote was still
    // its bytes (CORE-166).
    const left = projectFiles();
    const backups = left.filter((f) => f.startsWith('pharn/.backup/'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^pharn\/\.backup\/[^/]+\/pharn\.config\.json$/);
    // `.gitignore` too: pharn's lines in it are harmless and stay (removing
    // a user-file line would be a rewrite).
    expect(left.filter((f) => !f.startsWith('pharn/.backup/'))).toEqual([
      '.gitignore',
      CONSTITUTION,
    ]);
    expect(read('.gitignore')).toBe(PHARN_GITIGNORE_BLOCK);
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(existsSync(at('pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(at('.claude'))).toBe(false);
    expect(existsSync(at(REPO_DIR))).toBe(true);
    // Nothing is left wiring a removed script, so there is no HOOKS note.
    expect(
      vi.mocked(clack.note).mock.calls.some(([, title]) => title === 'HOOKS'),
    ).toBe(false);
  });

  it('uninstall --yes keeps a settings.json edited after init, lists it, and names its dangling hooks', async () => {
    await installFresh();
    const edited = HOOK_SETTINGS.replace('}}', '},"mine":true}');
    expect(edited).not.toBe(HOOK_SETTINGS);
    writeFileSync(at('.claude/settings.json'), edited);
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();

    expect(read('.claude/settings.json')).toBe(edited);
    const bodies = (title: string): string =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, t]) => t === title)
        .map(([body]) => String(body))
        .join('\n');
    expect(bodies('PLAN')).toContain(
      'Keep 1 file(s) you changed (they stay where they are):\n  • .claude/settings.json',
    );
    expect(bodies('HOOKS')).toContain(
      '.claude/settings.json still wires 1 hook(s) whose script was removed:',
    );
    expect(bodies('HOOKS')).toContain('.claude/hooks/guard.cjs');
  });
  it('uninstall --yes deletes an unchanged agent and keeps an edited one', async () => {
    await installFresh();
    writeFileSync(at(AGENT), 'my own lens agent\n');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(read(AGENT)).toBe('my own lens agent\n');
  });
  it('uninstall afterwards leaves no empty pharn/, and names what it kept', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    await installFresh();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(readdirSync(at('pharn'))).toEqual(['.backup']);
    // `.claude/` is gone too: the settings.json init wrote was unchanged, so
    // uninstall deleted it, and the directory ended empty (CORE-166).
    expect(rootEntries()).toEqual(['.gitignore', 'pharn']);
  });
});
