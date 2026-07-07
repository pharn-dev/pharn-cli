# PLAN — hook-symlink-escape

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 (sha256 of ARCHITECTURE.md, read this run)
- increment: Resolve write targets through symlinks (realpath) in BOTH pre-write floor hooks BEFORE the trusted-doc / writes-scope test, closing the committed-symlink escape; plus two doc-integrity nits the reporter bundled.
- layer(s): the **floor** (`.claude/hooks/*.cjs`) — NOT a product-tree layer (ARCHITECTURE §4 tree is pharn-contracts→…; the hooks are the deterministic enforcement apparatus, ARCHITECTURE §2 primitive #1). Doc edits touch apparatus docs (`.dev/floor/README.md`) + the repo guide (`CLAUDE.md`).
- constitution_refs: [P0, P2, P5, P6, P7]

## The bug (discovery-grounded, read live this run)

Both PreToolUse hooks decide **lexically** on the raw `tool_input.file_path`:

- `protect-trusted-paths.cjs` — `isProtected(p)` matches on the string's basename/fragments (lines 44–50). No realpath.
- `enforce-writes-scope.cjs` — `toRel(p)` uses `path.resolve` (lexical `..` only) then glob-membership (lines 77–81, 142–148). No realpath.

So a **committed symlink** in an allowed dir — `features/notes.md → ../CONSTITUTION.md` — makes a plain `Write` to `features/notes.md` pass BOTH hooks (basename `notes.md` isn't protected; `features/notes.md` matches `features/**`), yet the write follows the symlink and clobbers a trusted doc. Confirmed by reading both hooks this run.

HALT-concern check (reporter's condition — "HALT if realpath of a non-existent target's parent breaks legit writes"): **RESOLVED by discovery**, not deferred:

- `find . -type l` and `git ls-files` (mode 120000) → **zero committed symlinks exist** in the repo, so stricter resolution cannot newly block any existing legit write.
- The resolver (below) is a **nearest-existing-ancestor realpath walk with a lexical fallback**, so a brand-new (not-yet-existent) target still resolves to a repo-relative path and passes membership exactly as today. Every existing hook test was traced against it (incl. the macOS `/var/folders → /private/var` symlinked temp dirs the suite already uses) and still passes.

## Files

- `.claude/hooks/protect-trusted-paths.cjs` — **EDIT.** Add `fs`/`path` + a `resolveWriteTarget(p)` helper (nearest-existing-ancestor realpath walk); check `isProtected` on BOTH the raw path AND its resolved real target before deny. Also correct the header comment: the wiring ref `settings.snippet.json` → `.claude/settings.json` (nit 1a). Layer: floor.
- `.claude/hooks/protect-trusted-paths.test.cjs` — **EDIT.** Add `node:fs`/`node:os` temp-dir machinery + symlink cases (see Tests). Layer: floor test (the eval-equivalent for a floor primitive).
- `.claude/hooks/enforce-writes-scope.cjs` — **EDIT.** Add the identical `resolveWriteTarget(p)` helper + a canonicalized `ROOT`; route `toRel(p)` through the resolver so scope membership is judged on the **real** target. Layer: floor.
- `.claude/hooks/enforce-writes-scope.test.cjs` — **EDIT.** Add symlink cases (see Tests). Layer: floor test.
- `.dev/floor/README.md` — **EDIT.** Fix the one stale ref on line 70: `../.claude/hooks/settings.snippet.json` → `.claude/settings.json` (nit 1b). Layer: apparatus doc.
- `CLAUDE.md` — **EDIT.** Remove the hardcoded counts on lines 87–89 (`GREEN — 35 capabilities checked`, `22 … lenses`, `13 … grillers`); keep the qualitative description + the existing "read the count live … never assert it from this doc (P6)" directive three lines above (nit 2). Layer: repo guide.

### Explicitly NOT touched (must NOT enter scope)

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `THREAT-MODEL.md`, `LIMITS.md`, `CODEOWNERS` — trusted/human-only (hook-denied, fix #2). The reporter confirms THREAT-MODEL is out of scope (the Bash-bypass downgrade is a separate increment).
- `set-writes-scope.cjs` — the setter is unaffected; only the enforcing hook resolves symlinks.

## Implementation (deterministic, stdlib-only, Node 24 — `fs.realpathSync` confirmed available: v24.13.1)

Add to BOTH hooks (duplicated, matching the existing pattern where `extractPaths`/`readStdin` are already duplicated — avoids a leaf→leaf `require` between two floor executables, P3):

```js
const ROOT = (() => {
  try {
    return fs.realpathSync(process.cwd());
  } catch {
    return process.cwd();
  }
})();

// Canonicalize a (possibly not-yet-existent) write target: realpath the nearest existing ancestor —
// which resolves any committed symlink at any depth — then re-append the missing tail. Fully
// deterministic; no LLM. New files (no ancestor is a symlink) resolve identically to today.
function resolveWriteTarget(p) {
  const abs = path.resolve(ROOT, String(p));
  const missing = [];
  let cur = abs;
  for (;;) {
    try {
      const real = fs.realpathSync(cur);
      return missing.length ? path.join(real, ...missing) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs; // reached fs root, nothing existed → lexical
      missing.unshift(path.basename(cur));
      cur = parent;
    }
  }
}
```

- **protect-trusted-paths.cjs:** deny if `isProtected(rawPath) || isProtected(resolveWriteTarget(rawPath))`. When the hit is via resolution, the deny message shows `raw → real` so the human sees the symlink. Raw check kept first ⇒ zero behavior change for the non-symlink path (no regression).
- **enforce-writes-scope.cjs:** `toRel(p)` becomes `path.relative(ROOT, resolveWriteTarget(p))` (forward-slashed); the existing `null`-on-escape + `=== SCOPE_FILE` + glob-membership logic is unchanged. `ROOT` is canonicalized so the `/var → /private/var` temp-dir prefix matches on both sides (else all writes would falsely read as escaping — this is the subtle break the reporter warned about, handled).

## Tests to write (P1 — the `*.test.cjs` black-box suites ARE the floor's eval/regression spec; assert exit codes)

- protect #1 — committed symlink `features/notes.md → ../CONSTITUTION.md` (real CONSTITUTION.md present) → `Write features/notes.md` ⇒ **exit 2**, stderr `/BLOCKED by PHARN floor/`.
- protect #2 — symlinked PARENT dir `features/evil → ..` + new leaf `features/evil/CONSTITUTION.md` ⇒ **exit 2** (proves the ancestor walk covers parent-dir symlinks, not just leaf).
- protect #3 — real (non-symlink) `features/notes.md` ⇒ **exit 0** (no false positive).
- scope #1 — same committed symlink, no scope file (default-safe-set) → `Write features/notes.md` ⇒ **exit 2**, stderr `/writes-scope guard/`, `Blocked path : CONSTITUTION.md` (judged on the real target).
- scope #2 — real (non-symlink) `features/notes.md`, no scope ⇒ **exit 0** (no false positive).
- scope #3 — scope `[features/foo/**]`, symlink `features/foo/link.md → ../../pharn-core/x.md` (real `pharn-core/x.md` present) ⇒ **exit 2** (real target outside the declared scope; target must EXIST or the symlink is broken — see residual (a)).
- Regression: the full existing `npm test` suite (both hook suites + `.dev/floor/*`) stays green — `/pharn-dev-regress` re-checks this deterministically.

## Contracts satisfied

- No `pharn-contracts/*` schema changes. This hardens two existing **floor primitives** (ARCHITECTURE §2 #1 — pre-write hook). It makes CONSTITUTION §"How this file is enforced" ("the agent cannot write to CONSTITUTION.md …") true against the symlink vector, and fix #7's `writes:`-ENFORCED claim true against it.

## Guarantee audit (P0)

- "A `Write|Edit|MultiEdit` whose target resolves through **existing** symlinks (any depth) to a trusted doc is DENIED" → **FLOOR** (hook #1 + deterministic `fs.realpathSync` canonicalization + basename enum match). Guarantee.
- "A `Write|Edit|MultiEdit` whose **real** target is outside the active writes-scope — incl. via a symlink — is DENIED" → **FLOOR** (hook #1 + realpath + anchored-glob membership). Guarantee.
- "Non-symlink and new-file writes are unaffected" → correctness property, demonstrated by the preserved existing suite + the two no-false-positive cases; deterministic (no new allow path opened).
- Residuals — **labeled, not sold as guarantees** (P7, LIMITS-style):
  - (a) A **broken** symlink (target absent) resolves lexically, so it cannot reach an **existing** trusted doc (to hit one the target must exist ⇒ not broken ⇒ caught). fix #2's trusted-doc guarantee is intact; a broken-symlink write to a fresh out-of-scope path in fix #7 falls back to lexical judgment — **advisory**, no regression from today, outside the reported vector (P7).
  - (b) `Bash`-tool writes (`echo > CONSTITUTION.md`) bypass PreToolUse Write/Edit/MultiEdit entirely — pre-existing **LIMIT**, explicitly out of scope ("Bash-bypass downgrade handled separately").
  - (c) The two doc nits + the header-comment ref are **advisory** integrity corrections, not floor claims.

## Trust audit (P2)

`tool_input.file_path` is attacker-controllable (**untrusted**) input; a committed symlink is untrusted filesystem state. The allow/deny decision rests ONLY on deterministic path resolution + enum/glob membership — **never** on any free-text/tainted field. Resolving the symlink deterministically (not "the model will notice") is the structural fix; taint never reaches the decision.

## Determinism audit (P5)

`fs.realpathSync` (filesystem canonicalization) + string basename equality + anchored-RegExp glob membership — all deterministic, zero LLM. Terminal behavior is **fail-closed DENY**, never a guess.

## Open questions (HALT)

_None open — resolved at the plan-approval gate (GATE 1)._

1. **Resolver depth — RESOLVED.** The human selected the **nearest-existing-ancestor walk** (the resolver this plan already specifies) over the literal single-level "realpath the dirname, join basename" form. Both close the reported leaf-symlink vector identically; the walk additionally leaves no depth residual. No open items remain — `/pharn-dev-build` may proceed.
