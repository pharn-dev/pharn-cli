# PLAN — capability-resolver (archetype detection → capability selection, pure core)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256 of ARCHITECTURE.md, read this run
- increment: Add pharn-cli's **pure, deterministic** archetype-detection + capability-selection core — `(package.json, capability-index) → { selected, skipped }` — with its test suite. **No fetch, no install, no command/hook/doc copying** (all deferred).
- layer(s): **product** (`pharn-cli` CLI, `src/`) — NOT a `pharn-*` methodology Capability. This is the installer's selection logic, consumer of the pharn-oss capability catalog.
- constitution_refs: [P3, P5, P6, P7, P0]

## Decisions carried in (human-selected at the plan HALT, this run)

1. **Applicability SoT = an index published by pharn-oss.** The resolver **consumes** the capability→archetype index as a **typed parameter**; it does not own the applicability data. Authoring the authoritative index file in pharn-oss is a **separate pharn-oss increment** (not this one).
2. **Smallest slice = the pure detection→selection core + tests only.** Fetch (degit/vendor-fetch), copying into `.claude/`, the product commands/hooks/trusted-docs install, and the summary UI are **deferred to follow-up increments**.
3. **Constrain to the existing spec = archetype-based selection.** Selection is by the four archetypes `{ssr, backend, spa, lib}` (`ARCHITECTURE.md §5`), detected via **membership over `package.json`**. The finer per-library / file-tree scheme from the original brief is **out of scope** until a human spec update lands (`ARCHITECTURE.md §5` + `THREAT-MODEL.md` describe neither install-time filtering nor file-tree scanning; trusted docs are human-only / hook-protected — I will not edit them).

## Grounding established this run (P6 — live reads, not memory)

- pharn-oss has **no `manifest.json`/`module.json`** anymore (only `SKILLS_VERSION`); it ships capabilities: `pharn-pipeline/grillers/<n>/<n>.md` (11) + `pharn-review/<n>/<n>.md` (22), each with `evals/`.
- **Every** capability frontmatter is `coupling: agnostic` with **no** archetype/stack/`applies_when` field — applicability is **not** declared anywhere machine-readable today. Hence decision #1 (a new index).
- `pharn-contracts/` (both repos) has only `eval-format.md`, `finding-shape.md`, `seam-config.md` — **no archetype enum, no index contract** exists yet, though `ARCHITECTURE.md §4` promises them. So the `Archetype` enum + index shape are defined **consumer-side in pharn-cli** for now (mirrors how `src/lib/manifest.ts` already owns pharn-cli's parse of a pharn-oss-owned schema). Coordination note, not a blocker.
- No existing `archetype` code in `src/` (greenfield). Product floor = **`npm run check`** (`format:check && lint && typecheck && test`); `.dev/floor/validate.mjs` walks only `.md` capabilities and **excludes `src/`** — so this increment's deterministic floor is the **vitest suite + tsc + eslint + prettier**, not `validate.mjs`.

## Files

- `src/types.ts` — **EDIT (additive)** — add `Archetype` (`'ssr'|'backend'|'spa'|'lib'`), `CapabilityEntry` (`{ name; role: 'griller'|'lens'; applies: 'universal' | Archetype[] }`), `CapabilityIndex` (`{ capabilities: CapabilityEntry[] }`), and the selection result types (`SelectedCapability`, `SkippedCapability`, `Selection`). Its axis ("the shared type vocabulary") is unchanged — layer product.
- `src/lib/archetype.ts` — **NEW** — `detectArchetypes(pkg): Archetype[]`. Pure deterministic membership over `deps ∪ devDeps` against three documented framework allowlists; `lib` is the empty-set fallback (the frameworkless base, `ARCHITECTURE.md §4`). One axis: *how archetype is detected from `package.json`*. Layer product.
- `src/lib/resolve-capabilities.ts` — **NEW** — `resolveCapabilities(archetypes, index): Selection`. Pure: `universal` ⇒ always selected; archetype-gated ⇒ selected iff `applies ∩ archetypes ≠ ∅`, else skipped **with a reason string**. Stable ordering. One axis: *the selection rule over the index*. Layer product.
- `tests/archetype.test.ts` — **NEW** — the eval/spec for detection (P1-equivalent for product TS).
- `tests/resolve-capabilities.test.ts` — **NEW** — the eval/spec for selection.

Nothing else is touched. No `src/steps/*`, no `src/commands/init.ts`, no `installer.ts`, no `vendor-fetch.ts` — the legacy module/wizard code is left byte-unchanged (it is already dead against live pharn-oss; retiring it is a later decision).

## Detection rule (the reviewable substance — deterministic, P5)

Over `package.json` `dependencies ∪ devDependencies` key set `D`:

- `has_ssr = D ∩ SSR_FRAMEWORKS ≠ ∅` — `SSR_FRAMEWORKS = { next, nuxt, @remix-run/react, @remix-run/node, @sveltejs/kit, astro, @angular/ssr }`
- `has_backend = D ∩ BACKEND_FRAMEWORKS ≠ ∅` — `BACKEND_FRAMEWORKS = { express, fastify, @nestjs/core, koa, hono, @hapi/hapi }`
- `has_spa = (D ∩ CLIENT_UI ≠ ∅) ∧ ¬has_ssr` — `CLIENT_UI = { react, vue, svelte, @angular/core, solid-js, preact }` (a client UI lib **without** a meta-framework ⇒ SPA; **with** one ⇒ it's the `ssr` archetype)
- `archetypes = {ssr if has_ssr} ∪ {backend if has_backend} ∪ {spa if has_spa}`; **if empty ⇒ `[lib]`**. Result is de-duplicated and returned in the fixed enum order `ssr, backend, spa, lib`.

Multi-archetype is intentional and deterministic (e.g. Next + Express ⇒ `[ssr, backend]`). The three allowlists are the main thing to review/tune (see Open questions).

## Contracts satisfied

- **`ARCHITECTURE.md §5` (archetype + map-consistency)** — implements "archetype ∈ {ssr,backend,spa,lib}, detected deterministically (membership over `package.json`)" as a pure function. Cited, not restated (P4).
- **`ARCHITECTURE.md §4`** — "A frameworkless lib runs on core alone" ⇒ the `lib` empty-set fallback. Cited (P4).
- **(future) capability-index schema** — this increment defines the **consumer-side** shape pharn-cli will parse; the **authoritative** schema stays pharn-oss's to own (P4). Named as a coordination point, not claimed as satisfied here.

## Evals to write (P1 — for product TS, the vitest suite IS the eval/spec)

`archetype.test.ts`:

- `{ next }` → `[ssr]`
- `{ express }` (no UI) → `[backend]`
- `{ react, vite }` (no meta-framework) → `[spa]`
- `{ next, react }` → `[ssr]` (meta-framework wins; NOT spa)
- `{ next, express }` → `[ssr, backend]` (multi)
- `{ next, prisma, drizzle }` → `[ssr]` (archetype is coarse — libs do NOT add archetypes; guards decision #3)
- `{}` / `{ lodash }` (no framework) → `[lib]`
- ordering is the fixed enum order regardless of input key order (determinism)

`resolve-capabilities.test.ts`:

- a `universal` entry (e.g. `security`) is selected for **every** archetype set, including `[lib]`
- **a11y (applies `[ssr, spa]`) is SELECTED for `[spa]` and SKIPPED for `[backend]` with a reason** — the brief's headline invariant ("a backend project gets no a11y")
- `[ssr, backend]` selects an entry applying to either
- empty index → empty `selected`, empty `skipped`
- an entry whose `applies` archetype is not in the detected set → `skipped` with reason; deterministic `selected`/`skipped` ordering
- same `(archetypes, index)` → identical `Selection` across repeated calls (pure/deterministic)

## Guarantee audit (P0)

- **"Detection is deterministic — same `package.json` → same archetype set."** → **floor: enum/membership check + the vitest suite.** `detectArchetypes` is a pure set-membership function over a fixed enum; asserted by `archetype.test.ts` and gated by `npm run check`.
- **"Selection is deterministic — same `(archetypes, index)` → same `{selected, skipped}`."** → **floor: enum/membership + vitest.** Pure set operation; asserted + `check`-gated.
- **"A backend-only project selects no frontend-only capability (e.g. a11y)."** → **floor: a specific vitest case** over the membership rule.
- **"The applicability data is correct / the installed methodology is safe."** → **advisory — NOT claimed here.** Correctness of the index's applicability values is pharn-oss's SoT + provenance (`LIMITS.md §1a`, `THREAT-MODEL.md §5`); the resolver guarantees only the membership computation over whatever index it is given.
- **"The untrusted index is validated safely."** → **out of scope / deferred (P7).** This increment consumes a **typed, already-validated** index. The strict parse/validation of untrusted bytes lands at the **fetch boundary** with the install increment (`THREAT-MODEL.md §2` surface B). This plan makes **no** validation guarantee — stated, not hidden.

No guarantee is claimed without a floor reduction. The one thing that could masquerade as a guarantee — "safe against a malicious index" — is explicitly deferred and labeled, not asserted.

## Trust audit (P2)

This increment ingests **no untrusted artifact at runtime**: the `CapabilityIndex` is a **typed parameter** supplied by the caller (tests supply fixtures). No network, no file reads of untrusted content, no taint to propagate **in scope**. Downstream boundary (named, not built here): when a follow-up **fetches** the index from pharn-oss, those bytes are **untrusted** (surface B) and MUST be validated at that boundary (name/enum allowlists + `..`/control-char rejection, mirroring `src/lib/validate.ts`) before reaching this resolver. The resolver's typed input contract **is** the downstream side of that future fence.

## Determinism audit (P5)

Every branch is a membership test: `dep ∈ ALLOWLIST`, `archetype ∈ applies`. **No LLM classification anywhere.** No fallback ends in a guess: no-signal detection returns `[lib]` (a **defined** membership outcome — the frameworkless base, §4), and an unmatched capability is deterministically `skipped` with a reason. There is no irreducible judgment in this core, so no "ask" step is needed; the "ask" fallback lives one layer up (detection ambiguity is resolved by the fixed allowlists, which the human tunes here at plan time).

## Open questions (HALT — resolve at approval)

1. **Confirm file-tree/file-name scanning is correctly DEFERRED** (this increment detects archetype from `package.json` only). The original brief wanted read-only file-name signals; decision #3 (constrain to `§5`'s "membership over `package.json`") implies package.json-only for now. Approve deferral, or pull file-name scanning into this increment?
2. **Confirm the three framework allowlists** (`SSR_FRAMEWORKS` / `BACKEND_FRAMEWORKS` / `CLIENT_UI` above). These are the substantive detection knobs — add/remove any frameworks?
3. **Confirm the consumer-side `CapabilityEntry` shape** — `{ name; role: 'griller'|'lens'; applies: 'universal' | Archetype[] }`. Enough for selection, or should the index carry more (e.g. destination path, `est_tokens`) now versus at the install increment?
