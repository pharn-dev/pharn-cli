# VERIFY — per-command flag allowlist (audit P-13)

## FLOOR layer — the gates that own the verdict

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`test` is the whole vitest suite with the feature in it — **56 files, 1149 tests**, of which
`tests/index.test.ts` grew from 36 to 63 cases. `validate` reports
`FLOOR: GREEN — 0 capabilities checked in .` (this increment adds no markdown capability, so it is
vacuously green and gates nothing here — stated so it is not read as evidence it did not produce).

**No `structural:*` gate:** the feature ships no committed expected↔actual eval pair, so none is in
the map — the same way `/pharn-dev-regress` handled `outside_eval_pairs: []`.

**VERIFIED: floor gates PASS.** (`check-verify.mjs` → `"verdict": "PASS"`, `failing_gates: []`,
exit 0.)

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.
**No verifiers registered — floor gates only.** Step 2 was a no-op; no verifier free-text exists, so
nothing tainted was appended and the verdict is provably the gates alone.

## What the deterministic suite actually pins for this feature

Worth naming, because "the gates passed" is only as strong as what they encode. The 27 new/changed
cases in `tests/index.test.ts` cover the three axes the defect lives on:

- **the refusals** — `status --json`, `list --strict`, `add --json`, `remove --yes`, `remove -y`,
  `init --force`, `update --json`, `status --archetype`, bare `--json` / `--force`, and the two
  short-circuit siblings (`status --help --json`, `list --version --force`);
- **the non-refusals** (a false positive would break a working command, which is worse than the bug
  fixed) — a `:`-bearing positional, the `--` terminator, the `rm` alias, `update --force --yes` in
  both orders, a bare `pharn`, `status --help` alone, `bogus --help`;
- **the boundaries that must NOT move** — `Unknown option` stays distinct from `Unsupported option`,
  `Unknown command` still wins for `bogus --json` and for the `Object.prototype` key `toString`, the
  flag gate beats the arity gate, and the table's grants equal what the `switch` threads into each
  command.

## Residual (honest, P0/P7)

**Verified = the named gates passed.** This is **not** a guarantee of correctness beyond what those
gates check. Two specific things it does not cover:

1. **Value shape is out of scope by decision** — `pharn list --json=false` still parses and exits 0
   with human-readable output. No gate encodes an opinion about it.
2. **The table is hand-written.** A row granting a flag the command does not read would be
   self-consistent; the new agreement test narrows that (it pins the option-object keys against the
   rows) but does not eliminate it — the rows themselves are still authored, not derived from the
   command signatures.

Verifier concerns would be advisory help, not assurance — and there are none, because there are no
verifiers.
