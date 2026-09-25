# VERIFY — review-cleanups

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, on node 22, with the session proxy
variables unset. They ran as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` /
`CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1649 tests). The increment's new and changed test files were copied into a base
  worktree (`8b53ba9`), where 16 of their cases fail, each for the reason the plan names:
  - F22: a route at `app/target/route.ts` / `app/vendor/route.ts` detects `[ssr]`, not
    `[ssr, backend]`. The committed file cannot load on the base (it imports the new
    `ECOSYSTEM_DIRS`), so these two ran as a standalone probe of the same cases;
  - F23: a closing `----` / `--- note`, an opening `----` / `--- note` and a field on the opening
    line are refused on the base, where upstream's own parser accepts them; and the CRLF pin
    (base refuses, the port reads it);
  - F21: the notice printed while the spinner ran; the `.gitignore` hint printed twice;
  - the hygiene test: `tests/` held three raw invisible characters;
  - `capabilitySubtree`: absent on the base (4 cases).

  The guard cases pass on both: a marked ecosystem tree is still skipped at zero budget, the empty
  block is still refused, and a body rule after a proper close changes nothing.
- The fence's differential test builds the parser from `.dev/floor/validate.mjs` itself, so it
  cannot drift from that copy; it asserts the extraction found exactly one such function.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- `npm run test:coverage` passes its ratchet (97.63 / 93.04 / 98.33 / 98.46) and `npm run build`
  exits 0; neither is a verdict gate, both are CI gates.
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

Named limits:

- The fence parity is against this repo's copy of upstream's validator. A future upstream change is
  seen only once that copy is refreshed.
- The CHANGELOG and CLAUDE.md text is advisory: markdownlint is its only floor. Each backfilled
  entry was written from its commit's message and checked against the later entries it merges with.
- The spinner ordering is proven through a recording clack mock, not a real terminal: the sandbox's
  egress proxy answers codeload with 403, so `pharn update` could not be driven end to end here.
