import { describe, expect, it } from 'vitest';
import {
  DEV_COMMAND_PREFIX,
  FIRST_FEATURE_COMMAND,
  MIN_CLI_FILE,
  PRODUCT_COMMAND_PREFIX,
  SKILLS_VERSION_FILE,
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

// The optional forward-compatibility handshake file. Its NAME is a contract with
// pharn-oss (upstream ships the file; the CLI reads it), so it is pinned here
// rather than left to a string literal in the reader.
describe('MIN_CLI_FILE', () => {
  it('is the root MIN_CLI file, beside SKILLS_VERSION', () => {
    expect(MIN_CLI_FILE).toBe('MIN_CLI');
  });

  it('is a repo-ROOT filename — no directory segment, like SKILLS_VERSION', () => {
    expect(MIN_CLI_FILE).not.toContain('/');
    expect(SKILLS_VERSION_FILE).not.toContain('/');
  });

  it('is distinct from SKILLS_VERSION (two files, two questions)', () => {
    expect(MIN_CLI_FILE).not.toBe(SKILLS_VERSION_FILE);
  });
});
