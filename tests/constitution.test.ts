import { describe, expect, it } from 'vitest';
import {
  MULTI_TENANT_PRINCIPLE,
  stripPrinciple,
} from '../src/lib/constitution.js';

// Mirrors the shape of pharn-core/templates/constitution/CONSTITUTION.*.md: YAML
// frontmatter with `principles_included`, an H1 + intro, one `## Principle N:`
// section per principle, then a trailing `## How this file is enforced`.
const NAMES: Record<number, string> = {
  1: 'Privacy by Default',
  2: 'Multi-Tenant Isolation',
  3: 'Layer Integrity',
  4: 'No Secrets in Code',
  5: 'Accessibility is Not Optional',
  6: 'Data Lifecycle Completeness',
};

function constitution(principles: number[]): string {
  const sections = principles
    .map(
      (n) =>
        `## Principle ${n}: ${NAMES[n]}\n\n- Rule for principle ${n}\n- VIOLATION: Stop pipeline.`,
    )
    .join('\n\n');
  return [
    '---',
    'file: "CONSTITUTION.md"',
    `principles_included: [${principles.join(', ')}]`,
    'kind: "pharn-owned"',
    '---',
    '',
    '# Constitution — Non-Negotiable Principles',
    '',
    'These principles override ALL rules.',
    '',
    sections,
    '',
    '## How this file is enforced',
    '',
    'The orchestrator injects this file before every agent prompt.',
    '',
  ].join('\n');
}

describe('stripPrinciple', () => {
  it('exposes Principle 2 as the multi-tenant principle', () => {
    expect(MULTI_TENANT_PRINCIPLE).toBe(2);
  });

  it('drops a middle principle (standard: [1,2,3,4] -> [1,3,4])', () => {
    const out = stripPrinciple(constitution([1, 2, 3, 4]), 2);
    expect(out).toContain('principles_included: [1, 3, 4]');
    expect(out).not.toMatch(/## Principle 2:/);
    expect(out).toContain('## Principle 1: Privacy by Default');
    expect(out).toContain('## Principle 3: Layer Integrity');
    expect(out).toContain('## Principle 4: No Secrets in Code');
    expect(out).toContain('## How this file is enforced');
    // Exactly one blank line where P2 used to be — no doubled blank lines.
    expect(out).not.toMatch(/\n\n\n/);
  });

  it('drops the first-listed principle (minimal: [2,3,4] -> [3,4])', () => {
    const out = stripPrinciple(constitution([2, 3, 4]), 2);
    expect(out).toContain('principles_included: [3, 4]');
    expect(out).not.toMatch(/## Principle 2:/);
    // The intro before the first principle is untouched.
    expect(out).toContain('These principles override ALL rules.');
    expect(out).toContain('## Principle 3: Layer Integrity');
    expect(out).not.toMatch(/\n\n\n/);
  });

  it('leaves later principles untouched (gdpr-strict: [1..6] -> [1,3,4,5,6])', () => {
    const out = stripPrinciple(constitution([1, 2, 3, 4, 5, 6]), 2);
    expect(out).toContain('principles_included: [1, 3, 4, 5, 6]');
    expect(out).not.toMatch(/## Principle 2:/);
    expect(out).toContain('## Principle 5: Accessibility is Not Optional');
    expect(out).toContain('## Principle 6: Data Lifecycle Completeness');
  });

  it('removes the whole section even when the body contains a "## " line', () => {
    const md = [
      '---',
      'principles_included: [1, 2, 3]',
      '---',
      '',
      '# Constitution',
      '',
      'Intro.',
      '',
      '## Principle 1: A',
      '',
      '- one',
      '',
      '## Principle 2: Multi-Tenant Isolation',
      '',
      '- rule',
      '## inline-hash-in-body',
      '- more',
      '',
      '## Principle 3: C',
      '',
      '- three',
      '',
      '## How this file is enforced',
      '',
      'x',
      '',
    ].join('\n');

    const out = stripPrinciple(md, 2);

    expect(out).toContain('principles_included: [1, 3]');
    expect(out).not.toMatch(/## Principle 2:/);
    expect(out).not.toContain('- rule');
    expect(out).not.toContain('inline-hash-in-body');
    expect(out).not.toContain('- more');
    expect(out).toContain('## Principle 3: C');
    expect(out).toContain('- three');
    expect(out).not.toMatch(/\n\n\n/);
  });

  it('is a no-op when the principle is absent', () => {
    const src = constitution([1, 3, 4]); // already without P2
    expect(stripPrinciple(src, 2)).toBe(src);
  });

  it('is a no-op on a string without the expected structure', () => {
    expect(stripPrinciple('STANDARD', 2)).toBe('STANDARD');
  });

  it('is idempotent', () => {
    const once = stripPrinciple(constitution([1, 2, 3, 4]), 2);
    expect(stripPrinciple(once, 2)).toBe(once);
  });
});
