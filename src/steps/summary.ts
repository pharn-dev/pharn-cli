import { isCancel, note, select } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import { row } from '../lib/format.js';
import type { ManifestModule } from '../types.js';
import type { WizardConfig } from '../types.js';

export type SummaryAction = 'install' | 'back' | 'cancel';

const CONSTITUTION_LABELS: Record<string, string> = {
  'gdpr-strict': 'GDPR-strict (principles 1–6)',
  standard: 'Standard (principles 1–4)',
  minimal: 'Minimal (principles 2–4)',
};

export async function runSummary(
  config: WizardConfig,
  resolved: ManifestModule[],
  skillsVersion: string,
): Promise<SummaryAction> {
  const lines: string[] = [
    '────────────────────────────────────────',
    '  PHARN Install Summary',
    '────────────────────────────────────────',
    '',
    row('Skills version', `v${skillsVersion}`),
    row(
      'Constitution',
      CONSTITUTION_LABELS[config.constitution] ?? config.constitution,
    ),
    row('Multi-tenant SaaS', config.isMultiTenant ? 'Yes' : 'No'),
    ...(config.isMultiTenant
      ? []
      : ['  Principle 2 (Multi-Tenant Isolation) will be omitted.']),
    row('Stack pack', config.stackPack ?? 'None'),
    '',
    '  MODULES (resolved, incl. dependencies)',
    ...resolved.map((m) => row(m.name, `v${m.version}`)),
    // schemaVersion 2: the per-tech skills resolved from wizard answers.
    ...(config.installedSkills && config.installedSkills.length > 0
      ? [
          '',
          '  SKILLS (selected)',
          ...config.installedSkills.map((s) =>
            row(s.skill, s.from.split('/')[0]!),
          ),
        ]
      : []),
    '',
    '────────────────────────────────────────',
  ];

  note(lines.join('\n'));

  const action = await select({
    message: 'Ready to install?',
    initialValue: 'install' as SummaryAction,
    options: [
      { value: 'install' as SummaryAction, label: 'Yes, install' },
      { value: 'back' as SummaryAction, label: 'Go back and change something' },
      { value: 'cancel' as SummaryAction, label: 'Cancel' },
    ],
  });

  if (isCancel(action)) cancelAndExit();
  return action;
}
