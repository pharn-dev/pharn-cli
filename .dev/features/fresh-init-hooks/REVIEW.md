# REVIEW — fresh-init-hooks

Floor first: `node .dev/floor/validate.mjs .` → GREEN (exit 0); `npm run check` green; verify PASS. Everything
below is **advisory** (reviewer judgment). The increment is `trust: untrusted`; no instruction-looking content
in it changed this review.

## Floor-gate findings (blocking)

None. Every guarantee in the increment reduces to a floor primitive: the write decision is one shared
existence/symlink predicate (`upstreamSettingsCopyable`, tested in install-capabilities and pinned by dry-run
parity); the upstream read is the existing bounded, symlink-refusing reader; every printed untrusted string goes
through `displayHook` / `escapeUnsafe` (tested with ESC, U+202E, U+2028) and the JSON through
`serializeJsonReport` (tested: no raw ESC on stdout). The "every hook is shown" claim is scoped in the code and
docs to the entries `hookEntries` recognises plus a counted remainder.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "src/lib/hook-wiring.ts:598"
  problem: "The dry-run HOOKS note is the real run's note verbatim, so `init --dry-run` prints 'Wrote .claude/settings.json from upstream' although nothing was written; only the PLAN line says 'Would write'. Chosen deliberately (the brief requires the preview to equal the run, as the preserved note already does), but a reader of the HOOKS note alone sees a past-tense claim that is false in a dry run."
  evidence: "`  Wrote ${CLAUDE_SETTINGS_FILE} from upstream. It wires ${summary.hooks.length} hook(s):`"
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/lib/hook-wiring.ts:599"
  problem: "The text note lists every recognised hook with no count cap (each line capped at 300 chars). Bounded by the reader's 256 KiB limit, so a hostile upstream can make the note long but not unbounded; keys, by contrast, stop at 20."
  evidence: "...summary.hooks.map((e) => `  ${displayHook(e)}`),"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/hook-wiring.ts:525"
  problem: "A hook whose `args` holds a non-string is shown with that element silently dropped (inherited from `hookEntries`), and is not counted in `skipped`; the displayed command can differ from what Claude Code would run. Pre-existing behaviour of the shared normaliser, not changed here (the brief forbids changing its signature); the review line points at the file."
  evidence: "hook.args.filter((a): a is string => typeof a === 'string')"
```

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/hook-wiring.ts:550"
  problem: "hook-wiring.ts now holds both the preserved-file drift report and the fresh-file summary. Same axis (what a settings file wires, read as data), and `readSettings` is private by design, so splitting would need it exported; acceptable, noted."
  evidence: "export function upstreamSettingsSummary(repoDir: string): FreshSettingsSummary {"
```

L-eval: every new behaviour has vitest cases (summary, composer, predicate, real run, `--yes` via the
integration suite, text and JSON dry runs, report projection). L-trust: free text from the clone reaches only
display text and JSON values; no branch, path or write derives from it.

## Proposed lesson (not written to canon)

- `prettier --write src tests` reformats the sha-pinned vendored files under `tests/fixtures/pharn-oss/`
  (62 tests went red until restored). Format only the files you touched, or run `npm run format`, which is
  scoped to `*.ts`. Provenance: this increment's build step. Candidate for `/pharn-dev-memory-promote` only if
  the human judges it recurring.

**VERDICT: GREEN — 0 floor findings; 4 advisory (1 important, 3 minor) for the human.**
