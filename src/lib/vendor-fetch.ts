import { basename } from 'node:path';
import degit from 'degit';
import { safeJoin } from './install-modules.js';
import { VENDOR_SOURCE_RE } from './validate.js';
import type { VendorSkill } from '../types.js';

export interface VendorFetchResult {
  // Vendor skills cloned successfully into .claude/skills/<name>/.
  fetched: string[];
  // Vendor skills with no known source — recorded for manual install.
  manual: string[];
  // Vendor skills whose fetch failed (network/404/invalid source). Non-fatal.
  failed: { name: string; message: string }[];
}

/**
 * Auto-fetch consented vendor official skills from their declared degit
 * `source` into `.claude/skills/<name>/`, mirroring the pharn-oss clone pattern
 * in lib/repo.ts. Each skill is independent: a skill with no source falls back
 * to manual, and any fetch failure is captured (never thrown) so it can never
 * abort the surrounding install. The dest path is guarded with `safeJoin`.
 */
export async function fetchVendorSkills(
  claudeDir: string,
  vendors: VendorSkill[],
): Promise<VendorFetchResult> {
  const result: VendorFetchResult = { fetched: [], manual: [], failed: [] };
  for (const vendor of vendors) {
    if (vendor.source == null) {
      result.manual.push(vendor.name);
      continue;
    }
    // Defense in depth: the source came from the validated manifest, but it is
    // handed to degit (which shells out), so re-check the allowlist.
    if (!VENDOR_SOURCE_RE.test(vendor.source) || vendor.source.includes('..')) {
      result.failed.push({
        name: vendor.name,
        message: `invalid source "${vendor.source}"`,
      });
      continue;
    }
    try {
      const dest = safeJoin(claudeDir, `skills/${basename(vendor.name)}`);
      await degit(vendor.source, { force: true, cache: false }).clone(dest);
      result.fetched.push(vendor.name);
    } catch (err) {
      result.failed.push({
        name: vendor.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
