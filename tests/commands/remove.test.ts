import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  at,
  config,
  installFresh,
  read,
  records,
  run,
  SECURITY,
  useHarness,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runRemove } from '../../src/commands/remove.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

describe('pharn remove, end to end', () => {
  it('remove <name> deletes that capability, its config entry and its records', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(existsSync(at('pharn/pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
    ]);
    const keys = Object.keys(records().files);
    expect(keys.filter((k) => k.includes('/a11y/'))).toEqual([]);
    expect(keys).toContain(SECURITY);
    // Every file was pharn's and unchanged, so nothing needed saving.
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });
});
