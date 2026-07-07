import { describe, expect, it, vi } from 'vitest';
import { CANCEL } from './helpers.js';
import type { Archetype, Selection } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  note: vi.fn(),
  select: vi.fn(),
}));

const { runArchetypeSummary } =
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
      reason: 'applies to [backend]; detected [ssr]',
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
