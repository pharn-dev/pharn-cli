# REVIEW — init-dry-run (`pharn init --dry-run [--json]` and `init --yes`)

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .` (exit 0). That floor check is the only guaranteed part of this review. Everything below is **advisory**: an LLM judgment over untrusted code and text.

## Blocking (floor-gate)

None. Every guarantee the increment claims reduces to a membership test or construction pinned by tests, or is labelled advisory:

- **`--json` needs `--dry-run`:** the `REQUIRED_WITH` Map lookup.
- **`--yes` never overwrites:** `conflictingWriteTargets` must be empty, checked before the lock and again under it. The residual window after that is documented in `docs/commands/init.md`.
- **One object on stdout:** a single `console.log` through `serializeJsonReport` / `escapeUnsafe`.
- **The preview's marks equal the prompt's:** one function, `planWriteTargets`, feeds both.
- **"The plan is a snapshot":** labelled advisory in the docs.

No sibling or step-to-step import was introduced (lib ← steps ← commands only), and no capability, `rule_id` or eval binding is involved.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'src/commands/init.ts:534'
  problem: "The HOOKS-note composition (hookWiringLines + the --strict line) is duplicated between the preview and steps/install-archetype.ts:204. Parity is pinned by a test (init-dry-run.test.ts 'prints the HOOKS note a real run prints'), not by construction; a shared helper in lib/hook-wiring.ts would make it structural."
  evidence: "hookLines.push('  `pharn status --strict` fails until they are wired.');"
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'src/commands/init.ts:425'
  problem: 'Two preview branches have no test: the text-mode warning sink (a MIN_CLI warning or unreadable upstream capability during a text dry run) and the rejected-models warning (init.ts:539-546). Coverage still clears the ratchet (97.73/93.98/98.06/98.59), but both are user-visible lines.'
  evidence: ': (message: string) => log.warn(message);'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'docs/troubleshooting.md:138'
  problem: "'pharn init has three prerequisites — … and an interactive terminal' is now true only of a plain init; --dry-run and --yes need no terminal. The next paragraph says so, but the opening sentence reads as absolute."
  evidence: '`pharn init` has three prerequisites — Node >= 24.2.0, a git repository, and an interactive terminal.'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'docs/commands/init.md:75'
  problem: "'It writes nothing' is backed by construction plus test spies and whole-tree snapshots — the same strength as update --dry-run's identical claim — not by a floor primitive. Consistent with the existing update docs, but strictly it is a tested property, not a hook-enforced one."
  evidence: 'It writes **nothing**: no files, no `pharn.config.json`'
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/init-report.ts:131'
  problem: 'targets[].rel and hooks entries are serialized uncapped (escaped only), mirroring update --dry-run --json. They are validated/contained upstream, but a hostile clone could still inflate the object; same posture as the existing update report.'
  evidence: 'rel: t.rel,'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/index.ts:85'
  problem: 'Because the command word defaults to init, a bare `pharn --dry-run` (and `pharn -y`) now preview/install, where they were previously refused as unsupported. Harmless and consistent with `pharn` = `pharn init`, but not called out in the docs.'
  evidence: "['init', ['archetype', 'ref', 'yes', 'dry-run', 'json']],"
```

## L-trust note

Nothing in the reviewed diff or in the fetched-content fixtures read as an instruction to the reviewer. Every untrusted value that reaches output is handled as data:

- **Upstream reasons, unknown-capability fields and hook entries:** capped where update caps them, then escaped by the shared serializer.
- **The user's own config key names:** listed by name only, never by value. In text they pass through `terminalSafe`; in JSON they are capped and escaped (pinned by `tests/init-dry-run.test.ts` and `tests/init-report.test.ts`).

## Lessons (proposed, not promoted)

- When a command gains a "non-interactive" flag next to a destructive confirmation, the safe shape is "proceed only where the confirmation would have nothing to protect", re-checked under the lock. That keeps the old reason for refusing `--yes`, instead of abandoning it.

Advisory review — 0 blocking, 6 minor. The decision (merge / fix / abandon) is the human's at GATE 2.

## Resolved after GATE 2

- **#1:** fixed. `preservedSettingsHookLines` in `src/lib/hook-wiring.ts` is now the one composition, used by both the real run and the dry run.
- **#2:** fixed. Two tests were added in `tests/init-dry-run.test.ts`: an unreadable upstream capability, and a rejected models block.
- **#3:** fixed. The troubleshooting wording was reworded.
- **#6:** fixed. `docs/commands/init.md` now documents a bare `pharn --dry-run` / `pharn -y`.
- **#4 and #5:** left as they are, by the human's decision.
