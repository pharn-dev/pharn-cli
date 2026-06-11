import { isCancel, multiselect } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import { shortDescription } from '../lib/format.js';
import type { ManifestModule } from '../types.js';

export async function runModuleSelect(
  optional: ManifestModule[],
  initial?: string[],
): Promise<string[]> {
  if (optional.length === 0) return [];

  const result = await multiselect({
    message: 'Which modules do you want? (pharn-core is always installed)',
    options: optional.map((m) => ({
      value: m.name,
      label: `${m.name} ${shortDescription(m.description)}`,
      hint: `v${m.version}`,
    })),
    initialValues: initial ?? optional.map((m) => m.name),
    required: false,
  });

  if (isCancel(result)) cancelAndExit();
  return result as string[];
}
