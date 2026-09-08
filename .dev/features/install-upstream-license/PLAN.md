# PLAN — install upstream's Apache-2.0 LICENSE, mapped away from the user's own

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Copy pharn-oss's root `LICENSE` into the project as part of the fixed product surface, at a MAPPED destination (`pharn/LICENSE` / `PHARN-LICENSE`) so a user redistributing an initialized repo carries the Apache-2.0 grant — and so upstream's license can never land on the user's own root `LICENSE`.
- layer(s): `src/lib` (layout + writer + mirror), `tests`, `docs`
- constitution_refs: [P2, P4, P5, P7]

## Discovery (P6 — read live this run)

- `grep -rn LICENSE src/ tests/` → **zero hits**. The file is in no copy set.
- Upstream ships a root `LICENSE` (verified present in a local `pharn-dev/pharn-oss` checkout) and no `NOTICE`.
- `src/lib/layout.ts:20-25` — the header concludes from "contents are never rewritten" that "a layout's source-relative-to-clone path IS its dest-relative-to-project path". `:55-56` and `src/lib/diff.ts:42-46` restate the same identity.
- `src/lib/install-manifest.ts:57-63` is ALREADY mapping-shaped ("paths an archetype install writes, **mapped to** their source path"), and `apply-update.ts` consumes the map dest→source. So a mapped entry needs no new machinery.

## The trap this plan exists to avoid

`paths.docs` entries are IDENTITY-mapped and copied `{ force: true }`. Adding `'LICENSE'` to `TRUSTED_DOCS` would `cpSync` upstream's Apache text **over the user's own root `LICENSE`** on every flat install — silent, unprompted data loss in a file users care about. The destination must differ from the source, which makes this the FIRST deliberate source≠dest mapping in the CLI.

## Files

- `src/lib/layout.ts` — a `license: { from, to }` pair on `LayoutPaths`; the header sentence and the `layoutPaths` comment amended so neither still asserts unconditional path identity — layer `lib`
- `src/lib/diff.ts` — the same amendment to its layout comment — layer `lib`
- `src/lib/install-capabilities.ts` — copy after the docs loop, same guard shape — layer `lib`
- `src/lib/install-manifest.ts` — the mapped entry beside the docs block, manifest posture — layer `lib`
- `tests/layout.test.ts` — the new field in both layouts — layer `tests`
- `tests/install-capabilities.test.ts` — `LICENSE` in both scaffolds; flat writes `PHARN-LICENSE`; pharn writes `pharn/LICENSE`; **a pre-existing project `LICENSE` is byte-identical after init**; a symlinked upstream `LICENSE` is not copied — layer `tests`
- `tests/install-manifest.test.ts` — the mapped destination key points at the clone-root source; the mirror pin passes with `LICENSE` in the scaffold — layer `tests`
- `docs/getting-started.md`, `README.md`, `docs/commands/init.md` — the "What you get" row and the copy-set mention — layer `docs`
- `CHANGELOG.md` — user-visible, including the existing-install window — layer `docs`

## Evals to write (P1)

- `layoutPaths('flat').license` → `{ from: 'LICENSE', to: 'PHARN-LICENSE' }`; `'pharn'` → `{ from: 'LICENSE', to: 'pharn/LICENSE' }`.
- flat install writes `PHARN-LICENSE` with upstream's bytes; pharn install writes `pharn/LICENSE`.
- **the data-loss regression:** a project with its own root `LICENSE` has it byte-identical after `init`.
- a symlinked upstream `LICENSE` is neither copied nor expected.
- the manifest maps the destination key to the clone-ROOT source (not to a same-named dest path).
- a clone with no `LICENSE` installs cleanly and the manifest omits the key.

## Guarantee audit (P0)

- "a redistributed project carries the Apache-2.0 grant" → **conditional on upstream shipping `LICENSE`**; floor is the existence guard. NOT a claim that the repo is now license-compliant in general — no `NOTICE` is generated and no per-file headers are injected, because the CLI copies contents verbatim and never rewrites them.
- "the user's own `LICENSE` is never touched" → **floor: the destination is a different path by construction**, plus a test that asserts byte-identity after init.
- "writer and mirror agree" → **floor: the existing mirror pin**, which only means something with `LICENSE` in the scaffold.
- "existing installs receive it" → **NOT CLAIMED** — same `SKILLS_VERSION` early-return window as the previous two increments; named in the CHANGELOG, not worked around.

## Trust audit (P2)

`from`/`to` are fixed per-layout constants, never derived from clone contents. Both ends `safeJoin`-contained; the writer refuses a symlinked source, the manifest refuses a symlinked component. A manifest entry the installer never writes would be phantom drift AND — since the manifest drives `update`'s writes — would copy one in, so the two guards must agree.

## Determinism audit (P5)

A fixed constant per layout; membership tests only.

## Out of scope (P7)

- Generating a `NOTICE`, injecting per-file attribution headers, or rewriting copied contents.
- The wholesale "What you get" table rewrite (a later increment) — only the license row is added here.
- pharn-cli's own root `LICENSE` / `package.json` license field, both already correct.
- Letting a restore-only plan through `update`'s same-version early-return.

## Open questions (HALT)

- None.
