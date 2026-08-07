# VERIFY — add-version-gate

## FLOOR layer — the gates (these own the verdict)

| Gate           | Exit | Command                          |
| -------------- | ---- | -------------------------------- |
| `test`         | 0    | `npm test` — 38 files, **552 tests passed** (544 at base; +8 from this feature) |
| `validate`     | 0    | `node .dev/floor/validate.mjs .` — GREEN, 0 capabilities checked (see the disclosure below) |
| `lint`         | 0    | `npm run lint` (eslint)          |
| `format:check` | 0    | `npm run format:check` (prettier) |
| `lint:md`      | 0    | `npm run lint:md` (markdownlint) — 23 files, 0 issues |

`test` + `lint` + `format:check` + `lint:md` is exactly the repo's `npm run check` aggregate, so this
verdict tracks the full `npm run check` (L9's style-gate hole closed at verify — cited, not restated).

**No `structural:*` gate:** `git ls-files '*/evals/expected/*.json'` is empty — pharn-cli ships no
committed eval pair, so no such gate exists to run (absent from the map, exactly as `/pharn-dev-regress`
handles it).

### DISCLOSURE — how `validate` was measured, and the reading it is not

`validate` was measured over the repo's **tracked source with the feature applied** (a `git worktree`
at `135406a` + the working diff). That reading is **0 / GREEN**.

**In the live working directory the same command exits `1`.** That is disclosed here rather than
buried, because a reader who runs it will see it:

- All **15** blocking findings are inside the seven **gitignored** `test-*/` directories
  (`test-backend`, `test-edge`, `test-edge2`, `test-full`, `test-lib`, `test-next`, `test-spa` —
  2–3 each). **Zero** are in tracked source.
- Each is pharn-oss's own deliberately-red floor fixture,
  `<dir>/pharn/floor/test-fixtures/red/skill.md` ("missing required frontmatter field: version",
  "capability has no evals") — a fixture that is *supposed* to be red, copied in as a side effect of
  `npm run build:install-local`.
- They are untracked build artifacts, not repo content: `.gitignore:6-12` lists all seven, and
  `git ls-files test-lib` is empty. CI, which has no such installs, sees the tracked-source reading.
- `/pharn-dev-regress` independently measured this gate `0 → 0` across base and head on tracked source,
  so it is provably unmoved by this diff. It is permanently red for any feature on a machine that has
  run `build:install-local`, and would be equally red on an empty diff.

**This is an orchestration judgment, and it is advisory** (the gate SET and how each gate is scoped is
this command's advisory composition, not a floor lock). It is recorded so it can be disputed: a reader
who holds that `validate` must be measured over the literal working directory should read this stage's
verdict as **FAIL on `validate`**, for a reason that has nothing to do with the feature. Nothing is
hidden by the choice — both numbers are stated.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` (a deterministic `role:` frontmatter read, never a prose grep).
Step 2 was therefore a no-op and contributed nothing to the verdict.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.** `failing_gates: []`.

**verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance.** A defect in this gate that no test,
lint rule, or structural check encodes is invisible here. Concretely, what the suite does encode for
this feature is: the refusal fires on both add paths, names both versions and `pharn update`, fires
before `groupMultiselect` renders and before both the named no-op and the picker's `all-installed`,
writes nothing (mocks *and* a real-filesystem byte-identical records check), refuses symmetrically on
an older clone, survives a throwing `readSkillsVersion` with cleanup, and leaves the equal-version
path — including same-version-different-commit — behaving as before. What it does **not** encode is
any end-to-end run against live upstream; that is the manual e2e still outstanding.
