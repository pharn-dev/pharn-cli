# PLAN — pin floor.yml actions by digest; fix the stale setup-node version comments

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Pin `floor.yml`'s two third-party action refs by commit digest (the repo's existing digests), add the `persist-credentials: false` that the other four workflows already set, and correct the `# v6` setup-node comment in `ci.yml`/`publish.yml` to `# v7.0.0` — digest unchanged.
- layer(s): repo CI configuration (`.github/workflows/`) — not a product layer per `ARCHITECTURE.md §4`; no `src/**`, no `pharn-contracts`, no Capability.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Files

- `.github/workflows/floor.yml` — pin both `uses:` by digest + add `persist-credentials: false` — layer: repo CI
- `.github/workflows/ci.yml` — comment-only: `# v6` → `# v7.0.0` (digest byte-identical) — layer: repo CI
- `.github/workflows/publish.yml` — comment-only: `# v6` → `# v7.0.0` (digest byte-identical) — layer: repo CI

No other file. Explicitly NOT touched: `gitleaks.yml`, `codeql.yml`, `CHANGELOG.md` (precedent verified: the five prior workflow-only commits carry none), `docs/**`, `src/**`.

## Live state read this run (P6 — nothing asserted from memory)

- Base = `112e226` = `origin/main` (fetched this run). Working tree clean.
- `grep -rn "uses:" .github/workflows/` → exactly 5 files, 9 `uses:` lines. **`floor.yml:19-20` are the only two floating refs**; the other 7 are `@<40-hex> # v<semver>`.
- `persist-credentials: false` present in `ci.yml:17`, `codeql.yml:28`, `publish.yml:26`, `gitleaks.yml:32` — **4/4; `floor.yml` is the sole omission.**
- `floor.yml` body matches the described shape: header comment naming `pull_request` (NOT `pull_request_target`) and "no write and no secrets", `permissions: contents: read`, `node-version: lts/*`, two steps (unit tests, validate floor). **No steps or refs added since `112e226`.**
- `.github/dependabot.yml` — `github-actions` ecosystem, `weekly`, live.
- No floor check and no `tests/*.ts` reads `.github/workflows/**` (grepped): there is **no** existing deterministic gate over workflow files.

### Upstream digest↔tag verification (re-run this run; all lightweight tags — no `^{}` peeled lines)

| Check | Result | Status |
| --- | --- | --- |
| `ls-remote actions/checkout v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | ✅ **load-bearing — matches the repo's existing digest in 4 workflows** |
| `ls-remote --tags actions/setup-node \| grep 8207627` | `refs/tags/v7` **and** `refs/tags/v7.0.0` | ✅ **load-bearing — `8207627…` is v7.0.0** |
| `refs/tags/v7` (setup-node) head today | `820762786026740c76f36085b0efc47a31fe5020` | FYI — **has NOT advanced**; floor's floating `@v7` resolves today to the exact commit ci/publish pin |
| `refs/tags/v6` (setup-node) head today | `249970729cb0ef3589644e2896645e5dc5ba9c38` = v6.5.0 | FYI — moved (see provenance below) |

**Correction to the incoming brief, carried forward:** the brief's table renders the checkout digest as `3d3c42e5aac5ba805825da76410c18127.0.1` — a copy-paste corruption (38 chars, contains a `.`; not a valid SHA). The row's own rationale ("the repo's existing digest (4 workflows); verified = upstream `refs/tags/v7.0.1`") and the live `ls-remote` both resolve it unambiguously to `3d3c42e5aac5ba805825da76410c181273ba90b1`. Planned as the verified 40-hex value. This is **not** a digest↔tag mismatch (§3 HALT condition), so it is reported, not halted on — but it is surfaced rather than silently normalized.

### Provenance of the stale comment (sharper than the brief's framing — P6, read from git this run)

`ff48077` "chore(deps): bump actions/setup-node from 6 to 7 (#35)", authored by **dependabot**, did two things in one commit:

- `ci.yml`: `48b55a0… # v6` → `820762786026740c76f36085b0efc47a31fe5020 # v6` — **swapped the digest across a major bump and left the major-only comment untouched.** That is the exact commit where the comment started lying.
- `floor.yml`: `@v6` → `@v7` — a floating ref stayed floating.

Two independent demonstrations of rot, both verified live:

1. **Comment rot (the primary one):** the digest is v7.0.0; the comment says `v6`. The old pin `48b55a0…` was in fact **v6.4.0**, so `# v6` was already imprecise before it became wrong.
2. **Tag rot:** upstream `refs/tags/v6` has since moved v6.4.0 → **v6.5.0** (`2499707…`). A ref pinned to `v6` would silently be running different code today than when it was written.

And the asymmetry this PR removes: at `99ab306` dependabot bumped `floor.yml` `@v7` → `@v7.0.1` (tag→tag) while bumping the other four digest→digest. Dependabot preserves whatever form it finds, so **as long as floor.yml holds a tag, every future bump reproduces the divergence.** Converting the form is the durable fix — no new guard needed (see follow-ups).

## Contracts satisfied

- No `pharn-contracts` contract applies — this increment adds no Capability, no `rule_id`, no product behavior. It is repo hygiene of the dev-loop's own CI.
- It does align with the **convention stated in-repo** at `.github/workflows/gitleaks.yml:11` — "This mirrors the repo convention of pinning third-party code by digest, never a floating tag" (cited, not restated — P4). `floor.yml` is the one workflow that violated the convention its sibling file states.

## Evals to write (P1) — declared reduction, not a silent skip

**None.** P1 binds *behavior* ("no behavior ships without at least one vitest test"); this increment ships **no product behavior** — it changes CI configuration only, and there is no vitest/floor harness over `.github/workflows/**` (verified by grep above). Precedent is consistent: all five prior workflow-only commits (`a8c0472` the hardening commit, `99ab306`, `ff48077`, `0bf92a2`, `c425edd`) carry no test.

The proof of record is **execution, not assertion**: `floor.yml` triggers on `pull_request`, so the PR's own floor run parses and executes the edited file. A green floor check on the PR *is* the demonstration (P1's "demonstrates, not asserts"). Inventing a bespoke YAML-lint test here would be a speculative addition with no triggering need (**P7**).

## Guarantee audit (P0)

| Claim | Reduction |
| --- | --- |
| "The action code CI runs cannot change under us without a visible diff" | **FLOOR — content-hash** (`ARCHITECTURE.md §2` primitive #2). A commit digest is content-addressed; a tag is a mutable pointer. This is the whole point of the increment. |
| "The edited `floor.yml` parses and runs" | **FLOOR — execution.** floor.yml runs on `pull_request`; the PR's own green floor job is the proof. A local `js-yaml` parse is convenience, not the proof of record. |
| "Zero execution change today" (setup-node) | **FLOOR — verified equality**, `refs/tags/v7` head == the digest being pinned, checked this run. Scoped to *today*: if upstream's `v7` head moves before merge, the pin is still the repo's digest — the statement to make then is "the pin is unchanged," not "zero change." |
| "The pinned action is *safe*" | **STRUCK — not claimed.** Digest pinning guarantees *immutability*, never *safety*: a compromised-but-pinned action is still faithfully pinned. Directly analogous to `LIMITS.md §1b` ("trust in the remote is provenance, not cryptographic"). |
| "`persist-credentials: false` prevents token exfiltration from floor.yml" | **ADVISORY — defense-in-depth.** floor.yml already grants `permissions: contents: read` and uses `pull_request` (not `pull_request_target`), so the blast radius was already small; this removes the token from the on-disk git config as well. Honest label: **convention alignment + blast-radius reduction**, not a new guarantee. |
| "This repo now has zero floating action refs" | **FLOOR — regex/grep** (primitive #3), verified in Phase C as a one-shot check. Note it is a *point-in-time* verification, **not an enforced invariant** — nothing prevents a future floating ref (see follow-up #2). |

## Trust audit (P2)

No untrusted artifact is ingested by the **product** here — `src/**` is untouched, so the installer's ingest boundary is unchanged. The trust surface this touches is the **repo's own CI supply chain**: third-party action code executed in `floor.yml`. Taint direction: `floor.yml` runs on fork `pull_request` events, so it is the workflow most exposed to untrusted input (a fork's tree). Pinning by digest narrows *what code* runs there from "whatever the tag points at when the job starts" to "one fixed commit"; `persist-credentials: false` narrows what a compromise there could reach. Neither claim is upgraded past the labels in the guarantee audit.

## Determinism audit (P5)

Every branch in this increment is a membership/equality test on data read this run, with a hard-fail (never a guess) as the fallback:

- digest↔tag mapping: **exact string equality** vs `git ls-remote` output → mismatch = **HALT**, do not substitute a fresher digest.
- annotated-tag footgun: **presence test** for a `^{}` peeled line → all absent, so the plain line *is* the commit.
- scope: **whitelist membership** over three paths → a fourth file = **HALT**.
- "no floating refs remain": **regex** `@<40-hex> # v<semver>` over `grep -rn "uses:"`.

No classification, no judgment call, no silent fallback.

## Out of axis — observed, NOT in this increment (P3/P7)

1. **`node-version` policy** — floor uses `lts/*`, ci uses `20`, publish uses `24`. A real inconsistency, a different axis (CI matrix policy). Named as a follow-up; not touched.
2. **No enforced no-floating-refs invariant** — the guarantee audit labels the grep as point-in-time. A `.dev/floor/` regex gate over `.github/workflows/**` would make it structural (primitive #3). **Deliberately not added:** it needs a fourth file (a §3 HALT condition of the incoming brief), and once floor.yml holds a digest, dependabot preserves that form — so there is no triggering need today (**P7**). Recorded so the choice is visible, not forgotten.

## Open questions (HALT)

None blocking. Two items above are **reported, not questions**: the brief's corrupted digest string (resolved unambiguously against live `ls-remote`) and the two named out-of-axis follow-ups.
