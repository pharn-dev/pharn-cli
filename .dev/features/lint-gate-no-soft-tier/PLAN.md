# PLAN — lint gate loses its soft tier and covers the whole source surface (M5)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: `npm run lint` becomes a hard gate over `src` + `tests` + `scripts` — any warning from any rule fails — and the flat config stops lying about the platform by declaring the ESM-Node globals the plain-JS surface actually has.
- layer(s): repo-health tooling (no product layer; no `src/**` behavior change)
- constitution_refs: [P0, P1, P4, P5, P7]

## Live measurements taken this run (P6 — nothing asserted from memory)

Base `main` @ `dd8af18`, tree clean before and after every probe (`git status --porcelain` empty).

1. **Current gate is `eslint src`** (`package.json:40`); the only custom rule is
   `'@typescript-eslint/no-unused-vars': ['warn', …]` (`eslint.config.mjs:16-19`). `tests/` and
   `scripts/` are typechecked (`tsconfig.test.json`) but never linted.
2. **Re-measure of the expanded scope** — `npx eslint src tests scripts --max-warnings 0`
   → **EXIT=1**, exactly **6 × `no-undef`** in `scripts/install-local.mjs` (lines 18, 19, 48, 49, 54, 57
   on `console`/`process`), **0 warnings**. Matches the brief §0 exactly; nothing new appeared.
3. **Zero warnings anywhere** across all three dirs — the soft tier is empty, so hardening costs
   **zero code churn**.
4. **Negative proof, all three surfaces** — a planted `const unusedPlant = 1;` under `src/` (`.ts`),
   `tests/` (`.ts`), and `scripts/` (`.mjs`) is caught at **error** severity and **EXIT=1** on each,
   under the proposed config. (Plants removed; tree verified clean.)
5. **All three candidate globals blocks turn the tree green** (`src tests scripts --max-warnings 0`
   → EXIT=0, zero output): global `globals.node`, global `globals.nodeBuiltin`, and
   `files: ['**/*.mjs']`-scoped `globals.node`. So "does it go green" does **not** discriminate.

### Two corrections to the build prompt, both measured

- **The `globals` devDep row is a NO-OP — the dep already exists.** `package.json:64` already declares
  `"globals": "^17.9.0"`, and `package-lock.json` carries it as a **root devDependency** (`dev: true`,
  17.9.0). The brief's "resolvable only transitively" is false as of this run. Consequence: **no
  devDependency line is added and `package-lock.json` does not change** — the five-row table collapses
  to four. It also settles the brief's devDep-vs-handwritten question in the strong direction: the
  dependency is already owned, so importing it costs nothing new, and the hand-written
  `{ console, process }` alternative is strictly worse (incomplete platform truth) for zero savings.
- **`globals.node` is the WRONG set for this repo; `globals.nodeBuiltin` is the right one.** Both
  `scripts/*.mjs` are ESM (`import` + `import.meta.url`) and the package is `"type": "module"`.
  `globals.node` additionally declares the CJS-only names `require`, `module`, `exports`, `__dirname`,
  `__filename` — which **do not exist** in ESM. Measured discriminator: a probe file using `__dirname`
  and `require()` in an ESM `.mjs` →

  | variant | catches `'__dirname' is not defined` | catches `'require' is not defined` |
  | --- | --- | --- |
  | global `globals.node` | **no** | **no** |
  | `**/*.mjs`-scoped `globals.node` | **no** | **no** |
  | global `globals.nodeBuiltin` | **yes** | **yes** |

  Adopting `globals.node` would fix the config's lie in one direction and introduce it in the other:
  a real ESM runtime crash (`__dirname is not defined`) would pass the hardened gate. `nodeBuiltin`
  is the accurate platform statement and strictly the stronger gate.

## Files

- `package.json` — `lint` script `eslint src` → `eslint src tests scripts --max-warnings 0`; **no
  devDependency change** (`globals` already declared) — layer: repo tooling
- `eslint.config.mjs` — add `import globals from 'globals'`; add the ESM-Node globals to the existing
  shared `languageOptions`; flip `no-unused-vars` `'warn'` → `'error'` (same ignore patterns) with a
  one-line comment that warnings are not a tier here — layer: repo tooling
- `CLAUDE.md` — line 18, narrate the new scope + no-warnings posture — layer: docs (P4)
- `docs/contributing.md` — line 23, same — layer: docs (P4)
- `CHANGELOG.md` — one tooling line under `## [Unreleased]` — layer: docs
- `tests/lint-gate.test.ts` — **Q2 answered "yes" at the HALT** — pins that the `lint` script contains
  `--max-warnings 0` and all three directories — layer: tests (P1)

**Explicitly NOT editable** (invariant): `scripts/install-local.mjs` stays **byte-equivalent** — the 6
errors are resolved in config alone, because the code was never wrong. Also untouched:
`package-lock.json` (no dep change), `.github/workflows/ci.yml` (it calls `npm run lint`, so the
script change propagates with no workflow edit).

## Contracts satisfied

- None in `pharn-contracts` — this increment changes repo-health tooling only and adds no product
  behavior, no ingest path, and no config-schema surface. Cited, not restated (P4).

## Evals to write (P1)

This increment adds **no Capability and no `rule_id`**, so P1's per-capability eval requirement does
not attach. Its behavioral claim is nevertheless demonstrated rather than asserted, per P1's spirit:

- gate scope → planted unused var under `src/` (`.ts`) ⇒ `npm run lint` **exit 1**
- gate scope → planted unused var under `tests/` (`.ts`) ⇒ `npm run lint` **exit 1**
- gate scope → planted unused var under `scripts/` (`.mjs`) ⇒ `npm run lint` **exit 1**
- platform truth → `__dirname`/`require` in an ESM `.mjs` ⇒ **exit 1** (`no-undef`) — the reason
  `nodeBuiltin` is chosen over `node`
- clean tree → `npm run lint` ⇒ **exit 0**, and `git diff --stat` shows **no `scripts/` line**
- (if Q2 = yes) `tests/lint-gate.test.ts` pins that the `lint` script contains `--max-warnings 0` and
  all three directories

All exit codes captured **without a pipe** (`… > out 2>&1; echo $?`) — a piped `| tail; echo $?`
reports tail's status and has produced false greens in this project before.

## Guarantee audit (P0)

- "Any warning from any rule fails the gate" → **floor: CLI flag** `--max-warnings 0` in the `lint`
  script, which CI (`ci.yml:32`) and `npm run check` both invoke. Deterministic exit-code threshold,
  not judgment.
- "`tests/` and `scripts/` are linted" → **floor: the argv path list** in the same script.
- "A future rule added at `'warn'` cannot quietly reopen the soft tier" → **floor**, same flag: the
  threshold is on the **count**, independent of any rule's severity. (The `'warn'`→`'error'` flip is
  therefore **cosmetic honesty**, not the mechanism — recorded as such, not sold as the guarantee.)
- "`scripts/install-local.mjs` is unchanged" → **floor: `git diff --stat` shows no `scripts/` line**
  (byte-equivalence observable in the diff), asserted in Phase C.
- "The config states the platform truthfully" → **advisory.** `globals.nodeBuiltin` is measurably
  *stricter* than `globals.node` on the ESM-only names (table above), but "this set is exactly Node
  ESM" is a claim about an upstream package's contents, not a floor reduction. Labeled advisory; the
  floor backstop is that `no-undef` still fires on anything outside the declared set.
- "`.dev/floor/*.mjs` and `.claude/hooks/*.cjs` are covered" → **NOT CLAIMED.** They remain unlinted
  and out of axis (P7 — honest scope). Stated in the CHANGELOG line so the docs do not oversell.

## Trust audit (P2)

Not applicable — this increment ingests **no untrusted artifact**. It adds no fetch, no copy, and no
parse of remote content; `globals` is an already-declared, already-locked devDependency
(integrity-pinned in `package-lock.json`) consumed only at lint time, never shipped (`files: ["dist"]`).

## Determinism audit (P5)

The only branch introduced is ESLint's own exit code (`0` / non-zero) against a fixed integer
threshold — a membership test, no classification. No fallback ends in a guess. The two genuinely open
choices below are **asked**, not invented.

## Open questions (HALT) — RESOLVED at the gate

Both answered by the human on 2026-08-11; the plan was **approved as written**.

- **Q1 → `globals.nodeBuiltin`, global placement** (the recommendation).
- **Q2 → yes, build `tests/lint-gate.test.ts`.**

The original wording of each question is kept below as the record of what was asked.

- **Q1 — which globals set and placement?** Recommendation: **global `globals.nodeBuiltin`** (accurate
  for a `"type": "module"` repo; the only variant that catches `__dirname`/`require` in ESM; global
  rather than `**/*.mjs`-scoped because the whole repo is ESM Node and scoping states an incomplete
  truth for zero benefit). Alternatives measured: global `globals.node` (the brief's original, weaker
  gate), `**/*.mjs`-scoped `globals.node` (equally weak), hand-written `{ console, process }` (weakest;
  and now pointless since the dep is already owned).
- **Q2 — build the offered assertion test?** A ~6-line `tests/lint-gate.test.ts` reading the repo's own
  `package.json` and pinning that `lint` contains `--max-warnings 0` + `src`/`tests`/`scripts`.
  Precedent is **stronger than the brief claimed**: `tests/init.test.ts:188` is already a static test
  that walks the repo's own `src/` tree to hold an invariant, and `tests/seam-config.test.ts:206`
  spawns a repo-root floor checker. Without it, the gate is config-enforced only and a later
  `--max-warnings 0` deletion reopens the tier silently. Offered, **not bundled** — build only on an
  explicit yes.
