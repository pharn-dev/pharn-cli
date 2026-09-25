# SHIP — init-reinstall-safety

Stages run, in order:

1. `/pharn-dev-plan` → GATE 1 (human: plans A–F accepted with every recommended answer).
2. `/pharn-dev-grill`. The plan was amended with its findings before the build: the manifest-once
   count moved to `tests/init-archetype.test.ts`, where the real steps run, and the docs were to say
   which scan is authoritative.
3. `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`.
4. `/pharn-dev-review` found two false claims in the increment's own docs (REVIEW.md advisory
   findings 1–2). The scope was re-set from the plan, both were fixed within its `## Files` (plus one
   test pinning the corrected layout-change behavior), and build → regress → verify ran again.
   Everything below is from that second run.
5. GATE 2.

Deviations from the plan, all inside its `## Files`:

- `init.ts` gets the manifest from a thin `installManifest` in the install step, not from
  `install-manifest.ts` directly: a static guard in `tests/init.test.ts` forbids `init.ts` importing
  any `*manifest.js`, and the guard was kept rather than loosened.
- `tests/init.test.ts` gained one case beyond the call-shape changes: a cancelled summary builds no
  manifest and reads no records.
- The plan's reason for refusing a dangling `settings.json` link ("written through") was false when
  measured on Node 20.13 / 22 / 24; the approved decision stands on the true reason (REVIEW.md
  finding 1).

| stage                | structural verdict (verbatim)                          |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

- Review: [`REVIEW.md`](REVIEW.md) · Grill (advisory): [`GRILL.md`](GRILL.md)
- The run ended at **GATE 2**. The human's standing instruction for this batch: after each
  increment, open a pull request and merge it once its checks are green, then start the next plan.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
