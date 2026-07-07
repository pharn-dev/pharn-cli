# PLAN — build-format-step (format written files at build, not verify)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256(ARCHITECTURE.md)
- increment: Add an **advisory** build-completion **format step** to `/pharn-dev-build` so the files it writes are made style-conformant (project formatter + markdown fixer) **before** its Step-3 floor — so `format:check` / `lint:md` misses stop surfacing downstream at `/pharn-dev-verify` (the L9 pattern that bit the `product-loop` increment this run).
- layer(s): pharn-pipeline (a dev command; file at `.claude/commands/`, floor-ignored) # ARCHITECTURE.md §6
- constitution_refs: [P0, P4, P5, P7]

## Files

- `.claude/commands/pharn-dev-build.md` — MODIFY. Insert a new **"Step 2b — Format the written files (build-completion; ADVISORY)"** between Step 2 (build) and Step 3 (floor). It directs the builder to run the project formatter on the just-written files and confirm the style gates are clean before the floor. Cites L9 (`.dev/memory-bank/lessons-learned.md`) — does not restate it (P4). — layer pharn-pipeline

**Scope is dev-only (P7).** The failure was in `/pharn-dev-build` (a known `npm run format` formatter). The product `/pharn-build` runs over a USER project whose formatter is unknown/absent and must be **discovered** (like `/pharn-verify` discovers gates) — extending it there now, with no triggering product failure, would be speculative. Left for a separate increment if a real product failure surfaces.

## The change (exact shape)

New **Step 2b** (advisory), inserted before the Step-3 floor:

> **Step 2b — Format the written files (build-completion; ADVISORY).** After writing the plan's `## Files`, run the project formatter over them so style conformance is a **build** step, not a `/pharn-dev-verify` surprise (`.dev/memory-bank/lessons-learned.md` L9 — cite, don't restate, P4): `npm run format` (prettier `--write`), and `npx markdownlint-cli2 --fix` on any written `.md`. Then confirm `npm run format:check`, `npm run lint:md`, and `npm run lint` are clean; resolve any residual prettier↔markdownlint conflict (e.g. an indented fenced block inside a list item) by hand. This is **ADVISORY** — running a formatter is orchestration, not a floor guarantee; the floor gate remains `validate.mjs` (Step 3). It does not change the verdict; it prevents a foreseeable red at verify.

## Guarantee audit (P0)

- "Step 2b makes the build's output style-conformant" → **ADVISORY.** Running `npm run format` / `markdownlint --fix` is orchestration; there is **no** floor guarantee that the output is clean (the agent could skip it; a prettier↔markdownlint conflict needs a manual resolve). Labeled advisory in the step itself. **No new floor primitive.**
- "The floor gate is unchanged" → **FLOOR (unchanged).** Step 3 remains `validate.mjs`; the real style guarantee still lives at `/pharn-dev-verify`'s deterministic gates (`check-verify.mjs`, which already tracks `format:check` + `lint:md`, L9). Step 2b is a **convenience that reduces verify surprises**, never a replacement for the verify gate. Writing "Step 2b guarantees clean style" would be the P0 disease — struck.

## Trust audit (P2)

No new untrusted input is ingested and no egress added. The formatter (`prettier` / `markdownlint-cli2`) is a local dev tool run over files the build itself just wrote; it reads/writes source, not untrusted findings. No finding free-text enters any decision.

## Determinism audit (P5)

Step 2b is advisory orchestration with no proceed/stop branch of its own — it feeds the existing Step-3 floor (a membership/exit check) unchanged. The one judgment (resolving a rare prettier↔markdownlint conflict) is bounded manual work whose terminal fallback, if unresolvable, is the existing behavior: the style miss surfaces at `/pharn-dev-verify` exactly as today (no regression).

## Evals to write (P1)

None. No Capability is added (a command `.md` change; `.claude/commands/` is floor-ignored, has no `role:` eval surface). The check is that the repo stays green (`npm run check`) and `validate` stays GREEN after the edit — verified at build/verify, not via a new test.

## Open questions (HALT)

None. The design (advisory step, dev-only scope, cite-L9) is settled; it implements the `product-loop` REVIEW's lesson candidate directly.
