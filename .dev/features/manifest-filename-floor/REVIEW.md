# REVIEW — manifest-filename-floor (ADVISORY, except where marked FLOOR)

Floor first (P0): `node .dev/floor/validate.mjs .` → **exit 0 (GREEN)** at HEAD. Everything below is
advisory model judgment; the increment under review is treated as `trust: untrusted`.

## L-floor → P0

The increment's claims and their reductions:

| claim | reduction |
| --- | --- |
| a command/hook basename failing the allowlist is refused on BOTH write paths | **floor: enum-regex** — `COPY_FILENAME_RE` + `CONTROL_CHARS_RE` inside `assertSafeString` (`src/lib/validate.ts:18,85`) |
| the refusal hard-fails, never silently skips | **floor: code shape** — the validator throws; no catch is introduced inside the manifest |
| validation is scoped to the two `copyFilteredDir` surfaces | **floor: test** — `tests/install-manifest.test.ts` "capability, contract and floor names outside COPY_FILENAME_RE are still enumerated" |
| the manifest stays pure/read-only | **floor: code shape** — no write API added |
| the mirror still holds | **floor: the two pre-existing mirror describes**, unchanged and green |

No unreduced guarantee found. `assertNoDotDot` is strictly redundant behind `COPY_FILENAME_RE` (a
`..` cannot match that anchored pattern) — it is kept deliberately, because the point of the change
is that the two call sites run the SAME pair of assertions `copyFilteredDir` runs; dropping half of
the pair would reintroduce a difference to reason about. That is a mirror argument, not a security
one, and is recorded as such rather than sold as defense-in-depth.

## L-eval → P1

Six new cases in `tests/install-manifest.test.ts` (command name, uppercase hook, control-char hook,
top-level non-candidates, nested non-candidate, scope proof) and one end-to-end case in
`tests/update.test.ts`. The update case was **proven to fail without the source change** (the source
file was stashed and the single test re-run: `1 failed`), so it exercises the new behavior rather
than asserting it exists. The nested case is the one that pins `keep`-before-`validate` ordering
structurally rather than by inspection.

## L-trust → P2

The clone is untrusted. Before, its command/hook basenames became manifest KEYS with no name check,
and `applyWrites` used those keys as write destinations — taint reached a filesystem write with only
`safeJoin` + the symlink walk in between. The taint is now cut at the same point
`copyFilteredDir` cuts it. The verbatim-copied surfaces stay unvalidated by design; that is a
deliberate mirror requirement, stated in the code comment, not an omission. No free-text from the
clone drives any decision. Nothing instruction-looking in the plan or the spec changed my behavior.

## L-axis → P3

`install-manifest.ts` keeps one axis (the install path manifest) and already imported
`./validate.js`; no sibling-leaf import is introduced. `copyNameFloor` is a local closure, not a new
shared export — the allowlist itself stays single-sourced in `validate.ts`.

## Findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "docs/commands/status.md:74"
  problem: "The exit-code section says status exits 0 by default 'even when drift or an available update is found', but a clone carrying an out-of-allowlist command/hook name now exits 1 WITHOUT --strict; the sentence reads as a blanket promise it no longer keeps for that input class."
  evidence: "Exits `0` by default, even when drift or an available update is found (it is a report) — including when a path is unreadable."

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/install-manifest.ts:112"
  problem: "`addDir`'s third parameter is optional and used at exactly two of its six call sites, so nothing structural stops a future surface from being added without deciding whether it needs the floor — the decision lives only in the comment."
  evidence: "const addDir = (relDir: string, keep?: (rel: string) => boolean, validate?: (rel: string) => void): void => {"
```

**On finding 1 (the doc):** the class is **pre-existing, not introduced** — `status` already exits 1
on every other `ManifestValidationError` (a `safeJoin` escape, a bad capability name), because
`src/commands/status.ts:92,130` catch into `reportError`. This change widens that set by one input
class. Fixing the sentence is a `docs/` write, which is **outside this plan's `## Files`**, so it is
surfaced for the human rather than silently pulled in (fix #7 would have denied it anyway).

**On finding 2:** the alternative (a required parameter, `null` at the four verbatim surfaces) was
weighed and rejected — it would put a `null` literal at four call sites whose whole point is that
they must NOT validate, making the exception look like an oversight at each one instead of being
explained once. Recorded so the trade-off is visible, not hidden.

## Gate split (fix #3)

- **Floor-gate (blocking, deterministic):** `validate` 0, `npm run check` green, `check-verify` PASS,
  `check-regress` `no-regressions`. All GREEN — recorded in the sibling reports.
- **Advisory (never blocking):** both findings above. Their `severity` is LLM-assigned and gates
  nothing.
