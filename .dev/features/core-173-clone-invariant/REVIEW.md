# REVIEW — core-173-clone-invariant

- Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). `/pharn-dev-build`'s `npm run check` was GREEN (3603 passed); `/pharn-dev-regress` → `no-regressions`; `/pharn-dev-verify` → `PASS` across the eight gates.
- Everything below is ADVISORY unless marked floor-gate.

## Floor-gate findings

```yaml
- type: FINDING
  rule_id: P4
  severity: blocking
  file: "THREAT-MODEL.md:144"
  problem: "Until the human applies the patch script, THREAT-MODEL.md names `isSymlink` / `noSymlinks` as the floor for malicious paths, and neither exists in src/ any more: a doc that contradicts the code."
  evidence: "symlink rejection at copy roots (`isSymlink` / `noSymlinks` in `src/lib/install-capabilities.ts`)"
```

Floor-detectable: `grep -n 'isSymlink\|noSymlinks' THREAT-MODEL.md src/` finds them in the doc and nowhere in `src/`. Resolution: run `core-173-threat-model.patch.py` (dry-run verified: 10/10 replacements, markdownlint clean), then re-run `npm run lint:md`. This blocks MERGE, not the code: the increment is otherwise complete.

## Advisory findings

### L-floor (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "tests/tar-extract.test.ts:1"
  problem: "The 'only producer' test pins the obvious producers (extractTar*, mkdtemp*) by a source regex, not every way a directory could reach a clone-side reader; the premise stays partly advisory, as the plan's guarantee audit already says."
  evidence: "if (/\\b(extractTarGz|extractTar|mkdtempSync|mkdtemp)\\s*\\(/.test(text))"
```

The invariant's wording (`FetchedRepo.dir`, CLAUDE.md, SECURITY.md, the THREAT-MODEL patch) states the premise and its OS-level limit honestly, and every guarantee claimed reduces to the typeflag allowlist (enum) plus `safeJoin` (path containment). No unlabeled guarantee was found.

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/lib/install-capabilities.ts:396"
  problem: "Pre-existing, not introduced: the single-file copies (trusted docs, LICENSE, settings via upstreamSettingsCopyable) test existsSync, so a DIRECTORY at one of those clone paths reaches a non-recursive cpSync and throws mid-install, while the manifest's isFile check leaves it out. The old isSymlink check did not catch directories either."
  evidence: "return existsSync(from);"
```

Possible follow-up, not in scope: make those copies, and `upstreamSettingsCopyable`, test `isFile`, so the copy and the manifest agree on type the way they now agree on links.

### L-eval (P1)

No finding. Every new behaviour has a test that failed before the code change (18 red → green in `tests/tar-extract.test.ts`). The F-19 hard-link pin (`tests/install-capabilities.test.ts`) still passes with `unlinkFirst` in place of `noSymlinks`. The destination-guard tests are untouched and green. The deleted tests were all ones planting links or FIFOs inside fake clones, which the invariant now forbids. Deleting the FIFO test along with `O_NONBLOCK` was required (GRILL finding), or the suite would hang.

### L-trust (P2)

No finding. Archive names in refusal messages are escaped where they are built (`escapeUnsafe`, capped at 200), so `PHARN_DEBUG`'s raw error dump cannot carry a control or format character (GATE-1 decision). The other messages that interpolate `fullPath` run only after `assertDisplayablePath`. No pax payload is parsed any more, so fewer untrusted bytes are read. Nothing in the reviewed files tried to instruct the reviewer.

### L-axis (P3)

No finding. Each file keeps one reason to change. `hook-wiring.ts` drops its second read mode. No new cross-module import was added; two imports were removed (`symlink-guard` from `install-manifest.ts`, `fsConstants` from `capability-index.ts`).

## Numbers

- src: +158 / −327, net **−169** lines. The ticket's ≈ −300 was a target, not reached: the invariant's statement, the escape decision and the ENOTDIR helper add lines back, and the destination guards make up most of what remains in these files.
- tests: +196 / −703. 20 clone-side test sites removed, 1 test cut down (the MIRROR test), and new tests: `\`/`:` (5), base-256/`0xA0` (3), pax `x`/`g` rewrites, gzip-bounded bytes, the invariant property (5), and the producer pin.

## Proposed lesson (candidate only; promotion is a separate, human-gated `/pharn-dev-memory-promote`)

- **Before deleting a guard, list what else its code path provides.** Twice in this increment, removing an "unreachable" check would have removed a second behaviour. (a) The `noSymlinks` cpSync filter also selected Node's unlink-first copy path, which F-19's hard-link safety depends on. (b) `O_NONBLOCK` was keeping a FIFO test from hanging the worker. Provenance: `core-173-clone-invariant` (PLAN Finding 1, GRILL P1 finding; branch `pharndev/core-173-c35-tar-names-refuse-and-clone-side-guards` off `8fe3d5a`).

## Verdict

**blocked-with-1-floor-finding.** The finding is the THREAT-MODEL.md patch, a human action. The code increment itself is GREEN on every floor gate, with no other blocking finding.
