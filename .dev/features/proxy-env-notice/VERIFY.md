# VERIFY — proxy-env-notice

**Run 2** — after the `/pharn-dev-review` fix pass.

## FLOOR layer — the deterministic gates (owns the verdict)

| gate | command | exit |
| ---- | ------- | ---- |
| `test` | `npm test` | **0** |
| `validate` | `node .dev/floor/validate.mjs .` | **0** |
| `lint` | `npm run lint` | **0** |
| `format:check` | `npm run format:check` | **0** |
| `lint:md` | `npm run lint:md` | **0** |

`failing_gates[]`: **empty**. Suite: **43 files, 802 tests** (from 779 at run 1 — +23 net).

**`structural:*` — none.** The increment ships no committed eval pair, so no such gate is in the map.
`validate` remains **vacuously green**: the increment adds TypeScript modules, not a markdown
Capability, so frontmatter / eval-binding / archetype-map checks have nothing to bind to. The real
correctness signal is the vitest suite.

### What run 2 added to that signal

Run 1's verdict was PASS with three of five call sites untested. That gap is closed:

| file | covers |
| ---- | ------ |
| `tests/proxy-env.test.ts` | truth table incl. the casing hole and deterministic multi-variant resolution; `MEASURED_DEGIT_VERSIONS` membership; the runtime version read |
| `tests/proxy-env-format.test.ts` | confident vs hedged wording, redaction, control-char neutralization, length bound |
| `tests/init.test.ts` | notice emitted **before** the fetch |
| `tests/add.test.ts` | **both** fetch sites — named path and picker path — plus a no-clone path staying silent |
| `tests/update.test.ts` | wiring, plus the up-to-date early return staying silent |
| `tests/status.test.ts` | wiring on the drift path, plus `--no-drift` silence (previously asserted only in a comment) |

## The blocking finding from run 1, re-checked

`/pharn-dev-review` blocked on `docs/troubleshooting.md` claiming degit@3.6.6 was "the version this
release resolves." Re-measured this run: **degit's latest is 3.8.0**, `dependencies.degit` is
`^3.6.1`, `files: ["dist"]` ships no lockfile, and `scripts/build.mjs:15` marks degit `external` — so
the claim was wrong for any consumer installing today, not merely fragile.

The fix is **not** a reworded caveat. All nine published versions in the declared range
(`3.6.1 3.6.2 3.6.3 3.6.4 3.6.5 3.6.6 3.7.0 3.7.1 3.8.0`) were swept and all read only the lowercase
name; those nine are now `MEASURED_DEGIT_VERSIONS`, and the confident wording fires **only** on set
membership against the version read at runtime. That converts a hand measurement into an enum
membership test — a floor primitive (`ARCHITECTURE.md §2` #3) — and makes a future degit release
degrade the message rather than falsify it.

Smoke-checked against the live tree (`installed degit: 3.6.6 | measured: true`): the confident form on
a measured version, the hedged form naming both versions on `3.9.0`, and a distinct hedge when the
version cannot be read at all.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}`, a deterministic frontmatter read (P5), not a prose grep. Step 2 is a
no-op; none was authored for this increment (P7).

Consequence, unchanged from run 1: the questions a verifier would ask — *is a version-gated warning
the right response at all? does a line on every clone earn its place?* — were asked by no automated
layer. `/pharn-dev-grill` raised the nearest equivalents advisorily; the rest is the human's.

## Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

Machine report: [`verify-report.json`](verify-report.json) — `"verdict": "PASS"`, `"failing_gates": []`.

The verdict rests on the helper comparing integers. It cannot receive a finding, so no judgment could
have moved it. Advisory: which gates ran, how the map was assembled, and this prose.

**Residual (named, not hidden):** verified = **the named gates passed** — not a guarantee of
correctness beyond what those gates check. Two limits worth stating precisely, since run 1's residual
named a weakness this pass changed:

- The central factual premise is now **tested** (`MEASURED_DEGIT_VERSIONS` membership, and that
  `measured` is derived from it rather than constant) — but the test asserts the SET's contents, not
  that the set is TRUE of degit. The sweep that established it was a manual measurement; nothing in CI
  re-runs it. Adding a degit version to that set without measuring it would pass every gate here.
- Nothing checks that a doc sentence agrees with `package.json`. The class of defect that blocked run 1
  is still invisible to this verdict — it was caught by review, and would be again only by review.
