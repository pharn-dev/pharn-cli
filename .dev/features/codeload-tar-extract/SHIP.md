# SHIP — codeload-tar-extract

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The two findings that decided whether this worked at all:

**F1 — the spec's removal list is incomplete, and following it literally breaks the runtime.**
`lib/proxy-env.ts` landed after the spec was written and `require()`s `degit/package.json` on every
network-bearing command. Two modules, two test files and five call sites had to move with the
dependency.

**F2 — the `pax_global_header`.** Running the path rules over it fails every real archive on its
first block while passing every fixture built from a normal directory. The fixture builder now emits
one by default, and the whole path was run against the **live** remote: 1,640 files, `SKILLS_VERSION`
3.0.1, layout `pharn`, 153 deep prefix-split paths.

**Reported, and it contradicts an ORDER.md dependency:** the spec predicts this increment *lowers*
coverage, which is why ORDER.md sequences it before the `5.6c` ratchet. Measured, it **raises** it —
97.1% statements against a 90 threshold. The premise assumed the new extractor would arrive untested.

**Named, not softened:** users behind a proxy who relied on degit's own `https_proxy` read lose it.
`LIMITS.md` §3a, the CHANGELOG's `Removed` section, and `docs/troubleshooting.md` all say so, and the
notice fires before the fetch.

No speedup is claimed — no controlled A/B was run.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
