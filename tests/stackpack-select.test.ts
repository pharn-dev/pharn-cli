import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { ManifestModule } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  select: vi.fn(),
  log: { info: vi.fn() },
}));

const { runStackPackSelect } = await import('../src/steps/stackpack-select.js');
const prompts = await import('@clack/prompts');

const stackPacks: ManifestModule[] = [
  {
    name: 'pharn-stack-nextjs',
    version: '0.30.0',
    required: false,
    dependsOn: ['pharn-core', 'pharn-stack-react'],
    exclusiveWith: ['pharn-stack-*'],
    description: 'Next.js + Supabase + Better Auth + Vercel',
  },
];

describe('runStackPackSelect', () => {
  stubProcessExit();

  it('returns null without prompting when there are no stack packs', async () => {
    await expect(runStackPackSelect([])).resolves.toBeNull();
    expect(prompts.select).not.toHaveBeenCalled();
  });

  it('returns the chosen stack pack name', async () => {
    vi.mocked(prompts.select).mockResolvedValue('pharn-stack-nextjs');
    await expect(runStackPackSelect(stackPacks)).resolves.toBe(
      'pharn-stack-nextjs',
    );
  });

  it('maps the "None" sentinel to null', async () => {
    vi.mocked(prompts.select).mockResolvedValue('');
    await expect(runStackPackSelect(stackPacks)).resolves.toBeNull();
  });

  it('preselects the first pack on the first pass (initial undefined)', async () => {
    vi.mocked(prompts.select).mockResolvedValue('pharn-stack-nextjs');
    await runStackPackSelect(stackPacks);
    const arg = vi.mocked(prompts.select).mock.calls.at(-1)![0] as {
      initialValue: string;
    };
    expect(arg.initialValue).toBe('pharn-stack-nextjs');
  });

  it('preselects the None sentinel when None is carried back (initial null)', async () => {
    vi.mocked(prompts.select).mockResolvedValue('');
    await runStackPackSelect(stackPacks, null);
    const arg = vi.mocked(prompts.select).mock.calls.at(-1)![0] as {
      initialValue: string;
    };
    expect(arg.initialValue).toBe('');
  });

  it('renders the description hint without beheading "Next.js"', async () => {
    vi.mocked(prompts.select).mockResolvedValue('pharn-stack-nextjs');
    await runStackPackSelect(stackPacks);
    const arg = vi.mocked(prompts.select).mock.calls.at(-1)![0] as {
      options: { hint?: string }[];
    };
    expect(arg.options[0]!.hint).toContain('Next.js + Supabase');
  });

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);
    await expect(runStackPackSelect(stackPacks)).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
