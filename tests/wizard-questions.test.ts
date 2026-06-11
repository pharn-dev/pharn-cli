import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import { wizardSpec } from './wizard-fixture.js';
import type { WizardSpec } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  select: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(async () => true),
  log: { info: vi.fn(), warn: vi.fn() },
}));

const { runWizardQuestions } = await import('../src/steps/wizard-questions.js');
const prompts = await import('@clack/prompts');

const wizard = wizardSpec();

// Drive select() from a FIFO script of return values.
function script(values: unknown[]): void {
  let i = 0;
  vi.mocked(prompts.select).mockImplementation(async () => values[i++]);
}

describe('runWizardQuestions', () => {
  stubProcessExit();
  afterEach(() => vi.clearAllMocks());

  it('asks each question and returns the full answer map', async () => {
    script(['neon', 'drizzle', 'better-auth', 'resend', 'stripe']);
    const answers = await runWizardQuestions(wizard);
    expect(answers).toEqual({
      database: 'neon',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    });
    expect(prompts.select).toHaveBeenCalledTimes(5);
  });

  it('records "skip" and does not prompt a hideQuestion-hidden question', async () => {
    // A selectable trigger (the spec's convex is comingSoon, so it can only be
    // exercised at the rule-engine level — see wizard.test.ts).
    const inline: WizardSpec = {
      sections: [
        {
          id: 's',
          title: 'S',
          questions: [
            {
              id: 'a',
              prompt: 'A',
              options: [
                { value: 'x', label: 'X', install: null },
                { value: 'y', label: 'Y', install: null },
              ],
            },
            {
              id: 'b',
              prompt: 'B',
              options: [{ value: 'p', label: 'P', install: null }],
              rules: [{ type: 'hideQuestion', if: { a: 'x' } }],
            },
          ],
        },
      ],
      defaults: {},
    };
    script(['x']);
    const answers = await runWizardQuestions(inline);
    expect(answers).toEqual({ a: 'x', b: 'skip' });
    expect(prompts.select).toHaveBeenCalledTimes(1);
  });

  it('hides the supabase-auth option when database is not supabase', async () => {
    script(['neon', 'drizzle', 'better-auth', 'resend', 'stripe']);
    await runWizardQuestions(wizard);
    const authCall = vi.mocked(prompts.select).mock.calls[2]![0] as {
      options: { value: string }[];
    };
    expect(authCall.options.map((o) => o.value)).not.toContain('supabase-auth');
  });

  it('re-prompts when a coming-soon option is chosen', async () => {
    // database: first pick convex (coming soon) → warn + re-prompt → neon.
    script(['convex', 'neon', 'drizzle', 'better-auth', 'resend', 'stripe']);
    const answers = await runWizardQuestions(wizard);
    expect(answers.database).toBe('neon');
    expect(prompts.log.warn).toHaveBeenCalled();
  });

  it('soft-confirms a warn rule (better-auth + orm:skip)', async () => {
    script(['supabase', 'skip', 'better-auth', 'resend', 'stripe']);
    await runWizardQuestions(wizard);
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
  });

  it('exits when a question is cancelled', async () => {
    script([CANCEL]);
    await expect(runWizardQuestions(wizard)).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
