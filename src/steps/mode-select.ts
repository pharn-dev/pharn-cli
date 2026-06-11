import { isCancel, select } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';

export type WizardMode = 'default' | 'custom';

// schemaVersion 2: Default takes every answer from manifest.wizard.defaults and
// asks nothing per-tech; Custom renders each wizard question.
export async function runModeSelect(): Promise<WizardMode> {
  const result = await select({
    message: 'How do you want to configure your stack?',
    options: [
      {
        value: 'default' as WizardMode,
        label: 'Default',
        hint: 'recommended stack, no per-tech questions',
      },
      {
        value: 'custom' as WizardMode,
        label: 'Custom',
        hint: 'choose each technology',
      },
    ],
    initialValue: 'default' as WizardMode,
  });

  if (isCancel(result)) cancelAndExit();
  return result as WizardMode;
}
