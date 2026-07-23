import { describe, expect, it } from 'vitest';
import {
  DEV_COMMAND_PREFIX,
  FIRST_FEATURE_COMMAND,
  PRODUCT_COMMAND_PREFIX,
} from '../src/lib/constants.js';

// The post-`pharn init` first-run hint (printed by steps/install-archetype.ts)
// must name a real PRODUCT command — one copied into every install by the
// `pharn-*` / not-`pharn-dev-*` prefix filter (lib/install-capabilities.ts) —
// not a dev-loop command and not an arbitrary string. These lock the meaningful
// invariant (names an installed product command), not just the literal value.
describe('FIRST_FEATURE_COMMAND', () => {
  const bare = FIRST_FEATURE_COMMAND.replace(/^\//, '');

  it('is a slash command', () => {
    expect(FIRST_FEATURE_COMMAND.startsWith('/')).toBe(true);
  });

  it('names a product command (pharn- prefix)', () => {
    expect(bare.startsWith(PRODUCT_COMMAND_PREFIX)).toBe(true);
  });

  it('is not a dev-loop command (pharn-dev-*)', () => {
    expect(bare.startsWith(DEV_COMMAND_PREFIX)).toBe(false);
  });

  it('enters the pipeline at intent capture (/pharn-spec)', () => {
    expect(FIRST_FEATURE_COMMAND).toBe('/pharn-spec');
  });
});
