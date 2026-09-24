# PLAN — strict-frontmatter-fence (PHARN-14: the capability frontmatter reader must not disagree with upstream's validator)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `parseCapabilityIndex` reads the frontmatter FENCE line by line (the first line is exactly
  `---`, the block ends at the next line that is exactly `---`), so an empty frontmatter (`---\n---`)
  yields an empty block instead of reading `role`/`applies` out of the document body; and a
  `role` or `applies` key that appears more than once is a `ManifestValidationError` (the capability
  becomes `unknown` — named, never installed) instead of silently taking the FIRST occurrence while
  upstream's validator takes the LAST.
- layer(s): the CLI itself (`src/lib/capability-index.ts`, the untrusted-frontmatter fetch boundary)
- constitution_refs: [P1, P2, P5]

## Discovery — verified this run (P6)

`extractFrontmatter` uses `/^---\n([\s\S]*?)\n---/`: for `---\n---\nrole: lens\n---` the lazy capture
starts at the second `---` and runs to the third, so body lines are read as frontmatter.
`readField` uses a multiline `^field:` regex whose first match wins; pharn-oss's floor validator keeps
the last. Same file, two different `applies` → a capability can install with an applicability the
upstream gate never checked. Callers: only `role` and `applies` are read (`capability-index.ts:132-139`).

## Files

- `src/lib/capability-index.ts` — line-based fence; `readField` rejects a duplicated key — layer CLI/lib
- `tests/capability-index.test.ts` — empty frontmatter → unknown (not a body read); duplicated `role` /
  `applies` → unknown naming the field; unterminated fence → unknown; the valid fixtures still parse

## Contracts satisfied

- CLAUDE.md "strict field reader" at the fetch boundary — now unambiguous: one value or refusal.

## Evals to write (P1)

- listed above; the empty-frontmatter and duplicate cases fail on the base source.

## Guarantee audit (P0)

- "a capability's role/applies is the single value in its fenced block" → floor: exact-line fence
  match + occurrence count == 1.

## Trust audit (P2)

- Input is untrusted clone content; the change only narrows what is accepted. A refused capability
  lands in `unknown` (named warning; an installed one is KEPT, see PHARN-13).

## Determinism audit (P5)

- Pure string processing; no ordering dependence.

## Open questions (HALT)

- none
