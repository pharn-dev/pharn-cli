import { isCancel, multiselect, note } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';
import type { VendorSkill } from '../types.js';

/**
 * Vendor official skills (e.g. supabase) are published by the vendor and live
 * outside pharn-oss. This step records the user's consent (default-checked,
 * explicit confirm); on install, skills with a declared `source` are fetched
 * automatically from the vendor's registry, and any without a known source are
 * recorded for manual install. Returns the consented vendor skills.
 */
export async function runVendorConsent(
  candidates: VendorSkill[],
  initial?: VendorSkill[],
): Promise<VendorSkill[]> {
  // Dedupe by name, keeping the first occurrence (and its source).
  const seen = new Set<string>();
  const unique = candidates.filter((c) =>
    seen.has(c.name) ? false : (seen.add(c.name), true),
  );
  if (unique.length === 0) return [];

  note(
    [
      'These are official skills published by each vendor, fetched from the',
      "vendor's own registry — not from pharn-oss. Skills with a known source",
      'are fetched automatically on install; any marked (manual install) have',
      'no known source yet, so your choice is recorded and you install them by hand.',
    ].join('\n'),
    'Vendor skills',
  );

  const initialNames = new Set(initial?.map((v) => v.name));
  const result = await multiselect({
    message: 'Record consent for which vendor skills?',
    options: unique.map((v) => ({
      value: v.name,
      label: v.source ? v.name : `${v.name}  (manual install)`,
    })),
    // On loop-back, restore the prior consent (intersected with what's still on
    // offer); on the first pass everything is default-checked as documented.
    initialValues: initial
      ? unique.filter((v) => initialNames.has(v.name)).map((v) => v.name)
      : unique.map((v) => v.name),
    required: false,
  });

  if (isCancel(result)) cancelAndExit();
  const chosen = new Set(result as string[]);
  return unique.filter((v) => chosen.has(v.name));
}
