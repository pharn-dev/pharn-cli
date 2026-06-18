// Pure (no-I/O) constitution transforms. Sits with lib/wizard.ts and lib/diff.ts
// as a testable helper used by the installer when materializing CONSTITUTION.md.

// Principle 2 is "Multi-Tenant Isolation" across every shipped constitution
// variant. It is gated on the project's multi-tenant SaaS flag: a non-SaaS
// project has it stripped so it is not blocked by a principle that doesn't apply.
export const MULTI_TENANT_PRINCIPLE = 2;

/**
 * Remove a single constitution principle by its canonical number, keeping the
 * `principles_included` frontmatter array and the `## Principle N:` body
 * headings consistent (pharn-init's [A2] check cross-validates the two).
 *
 * Idempotent and defensive: stripping a principle that isn't present, or a
 * string that lacks the expected structure, returns the input unchanged.
 */
export function stripPrinciple(md: string, n: number): string {
  return dropPrincipleSection(dropFromPrinciplesIncluded(md, n), n);
}

// Drop `n` from the inline `principles_included: [...]` frontmatter array.
function dropFromPrinciplesIncluded(md: string, n: number): string {
  return md.replace(
    /^(principles_included:[ \t]*)\[([^\]]*)\]/m,
    (full, prefix: string, inner: string) => {
      const items = inner
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (!items.includes(String(n))) return full;
      const kept = items.filter((s) => s !== String(n));
      return `${prefix}[${kept.join(', ')}]`;
    },
  );
}

// Remove the `## Principle n:` heading and its body, collapsing to a single
// blank-line separator. The body runs up to the next *real* section boundary —
// another principle, the trailing `## How this file is enforced` section, or
// end of document — never an arbitrary `## ` that may appear inside the
// principle's own body (e.g. a fenced code block), which would leave a fragment.
function dropPrincipleSection(md: string, n: number): string {
  const re = new RegExp(
    String.raw`\n## Principle ${n}:[^\n]*\n[\s\S]*?(?=\n## Principle \d|\n## How this file is enforced|\s*$)`,
  );
  return md.replace(re, '');
}
