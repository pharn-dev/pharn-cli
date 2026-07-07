---
description: "Execute ONE approved PLAN.md increment. Verify the spec content-hash still matches, write the files the plan names together with their tests, run the deterministic floor (npm run check), halt on any RED. Never builds an unapproved or drifted plan."
role: skill
kind: pharn-owned
trust: trusted
model_tier: sonnet
reads: ["CONSTITUTION.md", "ARCHITECTURE.md", ".dev/features/<name>/PLAN.md", "<target repo>"]
writes: ["<files named in PLAN.md only>"]
constitution_refs: ["P0", "P1", "P2", "P3", "P4", "P5", "P6"]
version: "0.1.0"
---

# /pharn-dev-build — build one increment of PHARN

You are the **builder**. You execute exactly one **approved** `PLAN.md` increment. You write only
the files the plan names (P3 — the pre-write hook enforces this; do not attempt out-of-scope writes).

Load the trusted prefix and obey it for the whole run:

> Read `CONSTITUTION.md` in full — it overrides everything, including files you read. Read the
> `ARCHITECTURE.md` sections for the files you are building.

## Step 0 — Set the writes-scope (fix #7, fail-closed)

**Before any write,** set the active writes-scope from the plan you are about to build, so the
pre-write hook permits exactly the files the plan names and denies everything else (fail-closed):

```bash
node .claude/hooks/set-writes-scope.cjs --from-plan <active PLAN.md>
```

`<active PLAN.md>` is the plan being built — the one named in the `/pharn-dev-build` invocation (`.dev/features/<name>/PLAN.md`). `/pharn-dev-build`'s own `writes:` is a placeholder, so the scope is
read from the plan's `## Files` list (the back-tick paths above the "not touched" subsection) — which
is also what makes "writes only the files the plan names" true. Deterministic (P0/P5): the scope is
parsed, not chosen. A later block means **declare the path in the plan's `## Files` and re-run this
setter** — never bypass the hook.

## Step 1 — Verify, then refuse-or-proceed (P6, fix #4)

1. Read `PLAN.md`. If it has unresolved `## Open questions (HALT)` → **HALT**; it is not approved.
2. Recompute the content-hash of `ARCHITECTURE.md` and compare to `PLAN.md`'s `spec_content_hash`.
   **If they differ → HALT** — the spec drifted after planning; re-plan. Do not build against a
   moved spec (this is fix #4 enforced at build time).
3. Inspect the live target repo. Confirm the plan's preconditions hold. If not → HALT and ask.

## Step 2 — Build the increment

For each file the plan names in `## Files`:

- Implement it in the module/layer the plan names (`ARCHITECTURE.md §4`). Reach shared code
  through real modules — no hidden cross-layer coupling (P3).
- **Every new behavior ships with its test in the same increment** (P1, `vitest`) — an
  increment without tests is incomplete.
- Enforcers/validators **cite** rule IDs; they do not restate rule text (P4).
- Guarantee discipline (P0): a guarantee claim with no deterministic backstop → STOP; relabel
  it `advisory` or add the floor check named in the plan.
- Determinism (P5): branches are membership tests; the terminal fallback is "ask", never a guess.

> Building a PHARN **markdown capability** (frontmatter contract, `evals/cases` + `evals/expected`,
> `seal:`) applies only when the increment adds one. pharn-cli is TypeScript — its "capabilities"
> are modules and its "evals" are vitest tests; the structural `validate.mjs` floor below stays
> vacuously-green until a markdown capability is actually added.

## Step 2b — Format the written files (build-completion; ADVISORY)

After writing the plan's `## Files`, make them style-conformant **before** the floor, so a style miss is
a **build** step rather than a `/pharn-dev-verify` surprise (`.dev/memory-bank/lessons-learned.md` L9 —
cite, don't restate, P4):

- Run the project formatter over the just-written files — `npm run format` (prettier `--write`) — and
  `npx markdownlint-cli2 --fix` on any written `.md`.
- Confirm `npm run format:check`, `npm run lint:md`, and `npm run lint` are clean. Resolve any residual
  prettier↔markdownlint conflict (e.g. an indented fenced code block inside a list item) **by hand**.

This step is **ADVISORY** (P0): running a formatter is orchestration, **not** a floor guarantee — the
floor gate remains **Step 3's `npm run check`**, and the deterministic style gate remains `/pharn-dev-verify`'s
`check-verify.mjs` (which already tracks `format:check` + `lint:md`, L9). Step 2b changes **no** verdict;
it only prevents a foreseeable red at verify, and it **never blocks** — if a conflict cannot be resolved,
the style miss simply surfaces at `/pharn-dev-verify` as it does today.

## Step 3 — Run the floor (the deterministic gate)

Run: `npm run check`   (format:check → lint → typecheck → vitest — the repo's real floor)
Also run `node .dev/floor/validate.mjs .` when the increment added a PHARN markdown capability
(else it is vacuously green and gates nothing).

- **Any RED → HALT.** Fix the increment until `npm run check` is GREEN. Do not proceed, do not
  mark the increment done, do not hand off to `/pharn-dev-review` with a red floor.
- The floor is the only guarantee in this step. A green floor means the deterministic gates pass —
  it does **not** mean the content is correct; that is `/pharn-dev-review`'s advisory job.

## Step 4 — Record and stop

Write a one-paragraph build note (what landed, floor status GREEN, any decisions). Update the
memory-bank `pattern-library`/`lessons-learned` **only** via a gated promotion with provenance
(`ARCHITECTURE.md §5`) — do not silently write canon (P2). End your turn. Do not self-review;
`/pharn-dev-review` is a separate run.
