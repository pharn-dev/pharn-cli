import { confirm, isCancel } from '@clack/prompts';
import { cancelAndExit } from '../lib/confirm.js';

// Asks whether the project is a multi-tenant SaaS. Recorded as `isMultiTenant`
// in pharn.config.json and used to gate Principle 2 (Multi-Tenant Isolation) in
// the installed constitution: when false, P2 is stripped at materialize time so
// the project is not blocked by a principle that doesn't apply. Defaults to true
// (keeps P2), preserving the behavior that shipped before this flag existed.
export async function runMultiTenantSelect(
  initial?: boolean,
): Promise<boolean> {
  const result = await confirm({
    message:
      'Is this a multi-tenant SaaS? (keeps Principle 2: Multi-Tenant Isolation)',
    initialValue: initial ?? true,
  });

  if (isCancel(result)) cancelAndExit();
  return result;
}
