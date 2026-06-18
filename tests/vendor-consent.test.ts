import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { VendorSkill } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  multiselect: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn() },
}));

const { runVendorConsent } = await import('../src/steps/vendor-consent.js');
const prompts = await import('@clack/prompts');

const v = (name: string, source: string | null = null): VendorSkill => ({
  name,
  source,
});

describe('runVendorConsent', () => {
  stubProcessExit();

  it('returns [] without prompting when there are no candidates', async () => {
    await expect(runVendorConsent([])).resolves.toEqual([]);
    expect(prompts.multiselect).not.toHaveBeenCalled();
  });

  it('dedupes candidates and returns the consented set', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue(['supabase']);
    await expect(
      runVendorConsent([v('supabase', 'github:acme/supabase'), v('supabase')]),
    ).resolves.toEqual([v('supabase', 'github:acme/supabase')]);
    expect(prompts.note).toHaveBeenCalled();
    const [[arg]] = vi.mocked(prompts.multiselect).mock.calls as unknown as [
      [{ options: { value: string }[] }],
    ];
    expect(arg.options.map((o) => o.value)).toEqual(['supabase']);
  });

  it('labels unsourced candidates as manual install', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue([]);
    await runVendorConsent([
      v('supabase', 'github:acme/supabase'),
      v('stripe'),
    ]);
    const arg = vi.mocked(prompts.multiselect).mock.calls.at(-1)![0] as {
      options: { value: string; label: string }[];
    };
    expect(arg.options).toEqual([
      { value: 'supabase', label: 'supabase' },
      { value: 'stripe', label: 'stripe  (manual install)' },
    ]);
  });

  it('restores prior consent on loop-back, dropping no-longer-offered values', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue(['supabase']);
    await runVendorConsent(
      [v('supabase'), v('stripe')],
      [v('supabase'), v('gone')],
    );
    const arg = vi.mocked(prompts.multiselect).mock.calls.at(-1)![0] as {
      initialValues: string[];
    };
    expect(arg.initialValues).toEqual(['supabase']);
  });

  it('default-checks everything when no initial is given', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue([]);
    await runVendorConsent([v('supabase'), v('stripe')]);
    const arg = vi.mocked(prompts.multiselect).mock.calls.at(-1)![0] as {
      initialValues: string[];
    };
    expect(arg.initialValues).toEqual(['supabase', 'stripe']);
  });

  it('exits when cancelled', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue(CANCEL);
    await expect(runVendorConsent([v('supabase')])).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
