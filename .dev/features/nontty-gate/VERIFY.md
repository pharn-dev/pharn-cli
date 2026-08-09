# VERIFY — nontty-gate

- **verdict source:** `.dev/floor/check-verify.mjs` → `.dev/features/nontty-gate/verify-report.json`
- **verifier membership:** `node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`

## FLOOR layer — the gates that own the verdict

| gate | exit |
| --- | --- |
| `test` (`npm test` — 39 files, 625 assertions) | 0 |
| `validate` (`.dev/floor/validate.mjs .`) | 0 |
| `lint` (eslint) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint, 23 files) | 0 |

No `structural:*` gate — this repo ships no committed eval pairs (`pharn-review/*/evals/expected/*.json`
does not exist here; those live in pharn-oss). Absent from the map rather than faked, exactly as the
stage prescribes.

**VERIFIED: floor gates PASS** (`check-verify.mjs` exit **0**, `"verdict": "PASS"`, `failing_gates: []`).

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** Membership is a deterministic frontmatter read, and it
returned ∅, so Step 2 is a no-op and the verdict is the floor gates alone. No verifier free-text exists
to quote, so no untrusted DATA enters this report.

## Supplementary evidence (the increment's own Phase C — advisory, gates nothing)

Beyond the five floor gates, the increment's brief named its own acceptance evidence. Recorded here
because it was run, not because it changes the verdict.

### Coverage — no metric drops

| | base `74a6b40` | head | |
| --- | --- | --- | --- |
| All files — stmts / branch / funcs / lines | 94.75 / 87.87 / 98.14 / 96.28 | 94.78 / **88.01** / 98.14 / **96.30** | ↑ |
| `src/commands/init.ts` — stmts / branch / lines | 79.48 / 50 / 83.33 | **80.95** / **55** / **84.61** | ↑ |
| `src/commands/update.ts` — stmts / branch / lines | 90 / 80.68 / 91.81 | **90.4** / **82.29** / **92.17** | ↑ |
| `src/index.ts` | 85.29 / 88.88 / 66.66 / 87.87 | identical | = |

Every metric rose or held; none dropped. The uncovered line sets are the **same pre-existing regions**
shifted by the inserted lines — `init.ts` 71-72,78-82 → 99-100,106-110 (its `catch`/`failure` block);
`index.ts` 104,109-111 → 105,110-112 (the `isEntryPoint` auto-run block, unreachable under test);
`update.ts` three regions → three regions at the same offsets. **No newly-added line is uncovered.**

### `npm run build`

Clean — `tsc --noEmit` then esbuild → `dist/index.js` (71,716 bytes).

### Manual e2e — the original bug transcripts, inverted

Run against the built `dist/index.js` with **piped stdin** (`echo "" | …`), never a PTY.

| # | case | expected | observed |
| --- | --- | --- | --- |
| 1 | `update` in a configured dir | exit 1, both remedies named, zero network, config untouched | **exit 1**; message names `--yes` **and** "interactive terminal"; **0** network lines; config byte-identical (`cksum` equal) |
| 2a | `init` in a git-initialized dir | exit 1, no fetch, dir untouched | **exit 1**; **0** fetch/detect lines; directory listing unchanged |
| 2b | `init` in a **no-`.git`** dir | today's `git not found` error, byte-equivalent | **exit 1**, `✗ git not found. / Run: git init && git add -A && git commit -m 'init'` — and **no** TTY message leaked. Precedence holds |
| 2c | bare `pharn` (no command) | dispatches to init, refuses | **exit 1**, `pharn init is interactive` |
| 3.1 | `update --yes`, stale config, piped | full update runs non-interactively | **exit 0** — note printed (`Skills version v0.0.1-stale → v2.4.1`), plan, writes, summary: `restored 449 · skipped 0 (35 capabilities, skills v2.4.1)` |
| 3.2 | re-run `update --yes` | idempotent | **exit 0**, `Already up to date (skills v2.4.1)` |
| 3.3 | bare `update` in that same dir | still refuses | **exit 1** |
| 3.4 | `update --force` **without** `--yes` | refuses; `--force` does not imply `--yes` | **exit 1**, **0** network lines |

Live network was available; upstream `SKILLS_VERSION` read as `2.4.1` at run time. Case 3 is a real
transcript, not a fixture.

**Known cosmetic, accepted at plan time:** the banner and `intro()` still render before the refusal
(the gate sits after them, consistent with the `add`/`remove` pickers). Visible in transcript 2a.

## Residual (P0/P7 — stated, not hidden)

**Verified = the named gates passed.** This is **not** a guarantee of correctness beyond what those
gates check: a defect no test, lint rule, or structural check covers is invisible to this verdict, and
the advisory layer that might have noticed it is empty today. The e2e transcripts above are evidence a
human can read, not a floor gate — they were run by hand and nothing re-runs them. Verifier concerns,
when verifiers exist, are advisory help, not assurance.
