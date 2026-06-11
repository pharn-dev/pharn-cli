import { isCancel, select } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import type { ManifestModule } from '../types.js';

export async function runStackPackSelect(
  stackPacks: ManifestModule[],
  initial?: string | null,
): Promise<string | null> {
  if (stackPacks.length === 0) return null;

  const result = await select({
    message: 'Which stack pack? (adds framework-specific rules and skills)',
    options: [
      ...stackPacks.map((m) => ({
        value: m.name,
        label: m.name,
        hint: `${m.description.split(/[—.;]/)[0]!.trim()} · v${m.version}`,
      })),
      { value: '', label: 'None', hint: 'framework-agnostic only' },
    ],
    initialValue: initial ?? stackPacks[0]!.name,
  });

  if (isCancel(result)) cancelAndExit();
  return result === '' ? null : (result as string);
}
