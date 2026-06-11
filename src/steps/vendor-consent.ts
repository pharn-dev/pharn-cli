import { isCancel, multiselect, note } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';

/**
 * Vendor official skills (e.g. supabase) are published by the vendor and live
 * outside pharn-oss. External fetching is not built yet — this step records the
 * user's consent (default-checked, explicit confirm) so it can drive automatic
 * fetching once that ships. Returns the vendor skill names consented to.
 */
export async function runVendorConsent(
  candidates: string[],
  initial?: string[],
): Promise<string[]> {
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return [];

  note(
    [
      'These are official skills published by each vendor, fetched from the',
      "vendor's own registry — not from pharn-oss. Automatic fetching is",
      'coming soon; for now your choice is recorded and you install them by hand.',
    ].join('\n'),
    'Vendor skills',
  );

  const result = await multiselect({
    message: 'Record consent for which vendor skills?',
    options: unique.map((v) => ({ value: v, label: v })),
    // On loop-back, restore the prior consent (intersected with what's still on
    // offer); on the first pass everything is default-checked as documented.
    initialValues: initial?.filter((v) => unique.includes(v)) ?? unique,
    required: false,
  });

  if (isCancel(result)) cancelAndExit();
  return result as string[];
}
