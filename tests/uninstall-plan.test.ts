import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { sha256File } from '../src/lib/hash.js';
import { MODELS_RECORD_KEY } from '../src/lib/install-records.js';
import { planUninstall } from '../src/lib/uninstall-plan.js';

const tmp = useTmpDir();

function proj(): string {
  const p = join(tmp.path(), 'proj');
  mkdirSync(p, { recursive: true });
  return p;
}

function write(root: string, rel: string, content = 'pharn bytes'): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

// Write `rel` and record its CURRENT hash — "pharn wrote exactly these bytes".
function recorded(
  root: string,
  records: Record<string, string>,
  rel: string,
): void {
  records[rel] = sha256File(write(root, rel));
}

const HASH = 'a'.repeat(64);

describe('planUninstall', () => {
  it('deletes a recorded file still at its hash, keeps an edited one', () => {
    const root = proj();
    const records: Record<string, string> = {};
    recorded(root, records, 'CONSTITUTION.md');
    recorded(root, records, 'pharn-review/n-plus-one/n-plus-one.md');
    recorded(root, records, '.claude/hooks/protect-trusted-paths.cjs');
    write(root, 'CONSTITUTION.md', 'the user changed this');

    const plan = planUninstall(root, records);
    expect(plan.delete).toEqual([
      '.claude/hooks/protect-trusted-paths.cjs',
      'pharn-review/n-plus-one/n-plus-one.md',
    ]);
    expect(plan.edited).toEqual(['CONSTITUTION.md']);
    expect(plan.unsafe).toEqual([]);
  });

  it('never makes an UNRECORDED file a candidate, even inside a capability dir', () => {
    const root = proj();
    const records: Record<string, string> = {};
    recorded(root, records, 'pharn-review/a11y/a11y.md');
    write(root, 'pharn-review/a11y/my-notes.md');
    const plan = planUninstall(root, records);
    const all = Object.values(plan).flat();
    expect(JSON.stringify(all)).not.toContain('my-notes.md');
    expect(plan.delete).toEqual(['pharn-review/a11y/a11y.md']);
  });

  it('leaves a recorded key OUTSIDE the install surfaces even when its hash matches', () => {
    const root = proj();
    const records: Record<string, string> = {};
    recorded(root, records, 'src/app.ts');
    recorded(root, records, 'pharn/features/my-feature/PLAN.md');
    const plan = planUninstall(root, records);
    expect(plan.delete).toEqual([]);
    expect(plan.outside).toEqual([
      'pharn/features/my-feature/PLAN.md',
      'src/app.ts',
    ]);
  });

  it('skips the models record key (not a file)', () => {
    const root = proj();
    const plan = planUninstall(root, { [MODELS_RECORD_KEY]: HASH });
    expect(Object.values(plan).flat()).toEqual([]);
  });

  it('reports a recorded file that is already gone as absent', () => {
    const root = proj();
    const plan = planUninstall(root, { 'LIMITS.md': HASH });
    expect(plan.absent).toEqual(['LIMITS.md']);
  });

  it('reads a path below a regular FILE as absent (ENOTDIR)', () => {
    const root = proj();
    write(root, 'pharn-contracts', 'a file where a dir should be');
    const plan = planUninstall(root, {
      'pharn-contracts/finding-shape.md': HASH,
    });
    expect(plan.absent).toEqual(['pharn-contracts/finding-shape.md']);
  });

  it('reads a path whose PARENT walk meets a regular file as absent', () => {
    const root = proj();
    write(root, 'pharn-contracts', 'a file where a dir should be');
    const plan = planUninstall(root, {
      'pharn-contracts/sub/x.md': HASH,
    });
    expect(plan.absent).toEqual(['pharn-contracts/sub/x.md']);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps a file it cannot even stat (unsearchable parent) as unverifiable',
    () => {
      const root = proj();
      const records: Record<string, string> = {};
      recorded(root, records, 'pharn-contracts/finding-shape.md');
      chmodSync(join(root, 'pharn-contracts'), 0o600);
      try {
        const plan = planUninstall(root, records);
        expect(plan.unverifiable).toEqual(['pharn-contracts/finding-shape.md']);
      } finally {
        chmodSync(join(root, 'pharn-contracts'), 0o755);
      }
    },
  );

  it('keeps a recorded path that is a directory or a symlinked leaf as unverifiable', () => {
    const root = proj();
    mkdirSync(join(root, 'pharn-contracts/finding-shape.md'), {
      recursive: true,
    });
    const target = write(tmp.path(), 'outside/real.md');
    mkdirSync(join(root, '.claude/hooks'), { recursive: true });
    symlinkSync(target, join(root, '.claude/hooks/linked.cjs'));
    const plan = planUninstall(root, {
      'pharn-contracts/finding-shape.md': HASH,
      '.claude/hooks/linked.cjs': sha256File(target),
    });
    expect(plan.unverifiable).toEqual([
      '.claude/hooks/linked.cjs',
      'pharn-contracts/finding-shape.md',
    ]);
    expect(plan.delete).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')(
    'keeps a FIFO as unverifiable without opening it',
    () => {
      const root = proj();
      mkdirSync(join(root, '.claude/hooks'), { recursive: true });
      execFileSync('mkfifo', [join(root, '.claude/hooks/pipe.cjs')]);
      const plan = planUninstall(root, {
        '.claude/hooks/pipe.cjs': HASH,
      });
      expect(plan.unverifiable).toEqual(['.claude/hooks/pipe.cjs']);
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps an unreadable file as unverifiable (fail closed)',
    () => {
      const root = proj();
      const records: Record<string, string> = {};
      recorded(root, records, 'ARCHITECTURE.md');
      chmodSync(join(root, 'ARCHITECTURE.md'), 0o000);
      try {
        const plan = planUninstall(root, records);
        expect(plan.unverifiable).toEqual(['ARCHITECTURE.md']);
      } finally {
        chmodSync(join(root, 'ARCHITECTURE.md'), 0o644);
      }
    },
  );

  it('flags a path that crosses a symlinked DIRECTORY as unsafe', () => {
    const root = proj();
    const elsewhere = join(tmp.path(), 'shared');
    write(elsewhere, 'pharn-review/a11y/a11y.md');
    symlinkSync(elsewhere, join(root, 'pharn'));
    const plan = planUninstall(root, {
      'pharn/pharn-review/a11y/a11y.md': sha256File(
        join(elsewhere, 'pharn-review/a11y/a11y.md'),
      ),
    });
    expect(plan.unsafe).toEqual([
      { rel: 'pharn/pharn-review/a11y/a11y.md', component: 'pharn' },
    ]);
    expect(plan.delete).toEqual([]);
  });

  it('classifies at the pharn layout', () => {
    const root = proj();
    const records: Record<string, string> = {};
    recorded(root, records, 'pharn/CONSTITUTION.md');
    recorded(root, records, 'pharn/features/README.md');
    recorded(root, records, 'pharn/floor/validate.mjs');
    recorded(root, records, 'THREAT-MODEL.md');
    expect(planUninstall(root, records).delete).toEqual([
      'THREAT-MODEL.md',
      'pharn/CONSTITUTION.md',
      'pharn/features/README.md',
      'pharn/floor/validate.mjs',
    ]);
  });
});
