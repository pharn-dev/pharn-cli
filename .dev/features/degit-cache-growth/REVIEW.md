# REVIEW — degit-cache-growth

## Lens 1 — P7 (scope; do not ship dead code)

**PASS, and it is the whole decision.** The spec's Option B — an active prune — would now be
unreachable code: `5.3a` removed the dependency that wrote the cache, so a prune could only operate on
a directory pharn will never add to again. The spec anticipates this ("if that lands, degit stops
writing this cache at all and Option B becomes dead code — prefer Option A and cross-reference"), and
ORDER.md says the same. Shipping the helper plus its nine test cases anyway would have produced
exactly the artifact the spec's own retention-rule warning is about: tests and docs for a function
that cannot fire.

## Lens 2 — P4 (cite, do not restate)

**PASS.** `THREAT-MODEL.md` gets the growth mechanism in one paragraph and points at
`docs/troubleshooting.md` for the paths and the `du`; the troubleshooting section is where a user
looks and carries the operational detail. Neither restates the other.

## Lens 3 — P0 (claim only what is verified)

**PASS, with the provenance named.** The mechanism claim comes from the spec's verbatim quote of
`degit@3.6.6` and its recorded reproduction — it could not be re-measured this run, because the
dependency is gone. `VERIFY.md` says so rather than implying a fresh measurement. The plan's
`## Evals to write` is deliberately **empty** with a stated reason: a grep-the-docs test would pin
wording, not behaviour, and would break on a copy edit while proving nothing.

## Lens 4 — did this fix a real defect, or just re-describe one?

**PASS, with one genuine correction to shipped text.** Most of Option A landed with `5.3a`. What was
missing was the growth mechanism — without it a reader cannot tell whether a 400 MB cache is a bug
they hit or normal. And the existing text said "delete it yourself" while naming the **top-level**
`degit` cache path, which is shared with every other tool that uses degit; following it literally
destroys another project's cache. That advice is now scoped to
`degit/github/pharn-dev/pharn-oss`.

## Floor-gate vs advisory split

- **Floor:** six gates green; `validate.mjs` 0. Nothing more — this is a docs increment.
- **Advisory:** everything about whether the prose is *true*, which is the reviewer's job here.
