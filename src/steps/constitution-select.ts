import { isCancel, select } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import type { Constitution } from '../types.js';

// Maps a "privacy posture" answer to a constitution variant shipped in
// pharn-core/templates/constitution/. See that folder's README.md.
export async function runConstitutionSelect(
  initial?: Constitution,
): Promise<Constitution> {
  const result = await select({
    message: 'Privacy posture? (sets your project constitution)',
    options: [
      {
        value: 'gdpr-strict',
        label: 'GDPR / EU users / strict compliance',
        hint: 'principles 1–6; export + deletion enforced at the gate',
      },
      {
        value: 'standard',
        label: 'Standard SaaS with user data',
        hint: 'principles 1–4; a11y + data-lifecycle as rules, not gate',
      },
      {
        value: 'minimal',
        label: 'Internal tools / B2B, no end-user PII',
        hint: 'principles 2–4',
      },
    ],
    initialValue: initial ?? 'standard',
  });

  if (isCancel(result)) cancelAndExit();
  return result as Constitution;
}
