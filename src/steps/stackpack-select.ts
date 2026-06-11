import { isCancel, select } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import { shortDescription } from '../lib/format.js';
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
        hint: `${shortDescription(m.description)} · v${m.version}`,
      })),
      { value: '', label: 'None', hint: 'framework-agnostic only' },
    ],
    // undefined = first run (preselect the first pack); null = an explicit "None"
    // carried back on loop-back, which maps to the '' sentinel.
    initialValue: initial === undefined ? stackPacks[0]!.name : (initial ?? ''),
  });

  if (isCancel(result)) cancelAndExit();
  return result === '' ? null : (result as string);
}
