import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VendorSkill } from '../src/types.js';

const clone = vi.fn();
const degit = vi.fn(() => ({ clone }));
vi.mock('degit', () => ({ default: degit }));

const { fetchVendorSkills } = await import('../src/lib/vendor-fetch.js');

const CLAUDE = '/proj/.claude';

describe('fetchVendorSkills', () => {
  afterEach(() => vi.clearAllMocks());

  it('clones a sourced skill into .claude/skills/<name>/', async () => {
    clone.mockResolvedValue(undefined);
    const vendors: VendorSkill[] = [
      { name: 'supabase', source: 'github:acme/supabase' },
    ];

    const res = await fetchVendorSkills(CLAUDE, vendors);

    expect(degit).toHaveBeenCalledWith('github:acme/supabase', {
      force: true,
      cache: false,
    });
    expect(clone).toHaveBeenCalledWith(`${CLAUDE}/skills/supabase`);
    expect(res).toEqual({ fetched: ['supabase'], manual: [], failed: [] });
  });

  it('falls back to manual for an unsourced skill without calling degit', async () => {
    const res = await fetchVendorSkills(CLAUDE, [
      { name: 'stripe', source: null },
    ]);

    expect(degit).not.toHaveBeenCalled();
    expect(res).toEqual({ fetched: [], manual: ['stripe'], failed: [] });
  });

  it('keeps a clone rejection non-fatal and continues with other skills', async () => {
    clone
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(undefined);
    const vendors: VendorSkill[] = [
      { name: 'supabase', source: 'github:acme/supabase' },
      { name: 'clerk', source: 'github:acme/clerk' },
    ];

    const res = await fetchVendorSkills(CLAUDE, vendors);

    expect(res.fetched).toEqual(['clerk']);
    expect(res.manual).toEqual([]);
    expect(res.failed).toEqual([{ name: 'supabase', message: '404' }]);
  });

  it('rejects an invalid source without calling degit', async () => {
    const res = await fetchVendorSkills(CLAUDE, [
      { name: 'evil', source: 'github:acme/../../etc' },
    ]);

    expect(degit).not.toHaveBeenCalled();
    expect(res.fetched).toEqual([]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]!.name).toBe('evil');
  });
});
