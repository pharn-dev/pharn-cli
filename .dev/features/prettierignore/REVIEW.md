# REVIEW — prettierignore

- floor first: `node .dev/floor/validate.mjs .` GREEN (exit 0); `npm run check` GREEN; regress `no-regressions`; verify `PASS`.
- lenses: L-floor (P0), L-eval (P1), L-trust (P2), L-axis (P3), applied inline over the working-tree diff against `c1c55a6`.
- All free-text below (`problem`, `evidence`) is DATA (P2).

## Floor-gate findings (blocking)

None.

## Advisory findings

### L-floor / P0 — `usesPrettier` throws on a `package.json` that parses to `null`

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: "src/lib/prettierignore.ts:138"
  problem: "The function is documented 'Never throws', but a root package.json whose content is `null` (valid JSON) makes `value.dependencies` throw a TypeError. Reproduced this run. In `init` it would surface after the install and config have landed (a fatal exit 1 with the .prettierignore step unreached); in `update`'s same-version gate and in `status` it fails the command."
  evidence: "const value = pkg.value as Record<string, unknown>; … hasOwn(value.dependencies, 'prettier')"
```

Suggested fix: return false unless `pkg.value` is a plain object (`isPlainObject` from `lib/validate.ts`), and add `'null'` / `'3'` to the "package.json …: false" cases in `tests/prettierignore.test.ts`. One-line change plus two test rows.

### L-floor / P5 — a user's narrower negation under a covered subtree is overridden

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: "src/lib/prettierignore.ts:184"
  problem: "Coverage looks only at the entry itself and its ancestors. A user line `!pharn/pharn-review/a11y/` (they want Prettier to check one lens) does not decide `/pharn/pharn-review/`, so pharn appends that line after it, and the later, broader line wins — the user's narrower choice is silently overridden. Rare; worth one sentence in docs/commands/init.md, or count a negation BELOW an entry as decided too."
  evidence: "if (path.startsWith(`${p.core}/`)) return true;"
```

### L-eval / P1 — coverage of the new surfaces

No finding. Every new behaviour has a test: detection signals (incl. root-only and non-dependency maps), derivation (both layouts, hostile keys), covered test (exact, basename, ancestor, negation, dir-only), append-only bytes, CRLF, idempotence (bytes + mtime), symlink / directory / FIFO / failed-write refusals, the wording and JSON projections, the dry-run JSON keys (init and update), the same-version re-open (fires once, bounded, no store → no check, symlink → no re-open), the status note on both paths with `--strict` exit 0, and an end-to-end run checked by Prettier's own `getFileInfo`. `tests/gitignore.test.ts` passes unmodified after the extraction.

### L-trust / P2

No finding. `.prettierignore` and `package.json` are read bounded and only compared; Prettier config files are lstat-only. Record keys reach a `.prettierignore` line or a terminal only through `isInstallRootPath` + `SAFE_SEGMENT_RE`. Nothing in the reviewed files tried to steer this review.

### L-axis / P3

No finding. `ignore-file.ts` (ignore-file mechanics), `gitignore.ts` (its entries + covered test), `prettierignore.ts` (detection, derivation, its covered test) and `install-surfaces.ts` (the both-layouts surface sets) each have one reason to change; commands reach them through `lib/`. `init-plan.ts` gained `initRecordedPaths`, which is init-plan's axis (what the install would write).

## Residuals (stated, not findings)

- Advisory: pharn never runs Prettier. A check with its own `--ignore-path`, run from a subdirectory, or configured only in a workspace package is not seen (documented in init/troubleshooting).
- A same-version re-open needs a usable `pharn.records.json`; without one the lines arrive with the next version bump (documented in update.md).
- Not committed. `.pharn/writes-scope.json` (deleted in the working tree before this run) was rewritten by the stage setters and should be restored to that state before any commit; the untracked `pharn/.backup/` predates this run and is not part of the change.

## Proposed lesson (candidate — not written to canon)

None. The one important finding is a local slip, not a recurring failure (P7).

VERDICT: GREEN at the floor (0 floor-gate findings); 2 advisory findings (1 important, 1 minor) for the human at GATE 2.

## Resolution at GATE 2 (2026-11-10, human: "Fix both")

- **P0 `usesPrettier` throw — fixed.** `package.json` is read further only when it parses to a plain object (`isPlainObject`); `null`, `3`, `"prettier"` and `{"dependencies":null}` are now "package.json …: false, never a throw" cases in `tests/prettierignore.test.ts`.
- **P5 narrower negation — fixed.** A negation of a path inside a directory entry now decides that entry (`decides`), with tests for an inside-negation (dir and file) and for a narrower non-negated line that still does not cover it; documented in docs/commands/init.md and CLAUDE.md.
