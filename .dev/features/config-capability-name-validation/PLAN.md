# PLAN — config-capability-name-validation (PHARN-01: `remove` must never delete outside `<subtree>/<name>`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: validate every `capabilities[]` entry's `name` (`CAPABILITY_NAME_RE`, no control chars) and
  `role` (`{griller, lens}`) at config ingest with a new named `CapabilityEntryError`, and make
  `remove`'s recursive delete accept only a STRICT child of the role subtree (`safeChildJoin`), so a
  hand-edited `{"name":"../.."}` can no longer make `pharn remove` delete the project root.
- layer(s): the CLI itself (`src/lib/*`, `src/commands/remove.ts`)
- constitution_refs: [P0, P1, P2, P3, P5, P7]

## Discovery — verified this run (P6)

HEAD `2fffcb3` on `claude/bold-archimedes-5czyyn`, tree clean. Reproduced in the review
(`repro/remove-traversal`): config `{"name":"../..","role":"lens"}` + `pharn remove ../..` →
project root (incl. `.git`) deleted; `../../src` → `src/` deleted; picker path identical.

- `src/lib/pharn-config.ts:22-24` — comment: "`name` and `role` are still passed through unvalidated";
  `:216` only `validateCapabilitySources` runs.
- `src/lib/validate.ts:115-124` — `safeJoin` accepts `target === root`, so `${subtree}/../..` = cwd passes.
- `src/commands/remove.ts:87-96` — `rmSync(safeJoin(cwd, \`${subtree}/${name}\`), {recursive, force})`.

## Files

- `src/lib/validate.ts` — add `safeChildJoin(base, name)`: returns `resolve(base, name)` only when its
  `dirname` is exactly `resolve(base)` (a strict, single-segment child); throws `ManifestValidationError`
  otherwise — layer CLI/lib
- `src/lib/pharn-config.ts` — `CapabilityEntryError` + `validateCapabilityEntries(raw.capabilities)`
  (each entry: plain object, `name` via `assertSafeString(…, CAPABILITY_NAME_RE)`, `role` via
  `ROLE_VALUES` membership); joins `isConfigValidationError`; replaces the "unvalidated" comment — layer CLI/lib
- `src/commands/remove.ts` — `deleteCapabilityDir` resolves `safeChildJoin(safeJoin(cwd, subtree), name)` — layer CLI/command
- `tests/validate.test.ts` — `safeChildJoin` cases
- `tests/pharn-config.test.ts` — ingest rejection cases + valid legacy config still loads
- `tests/remove.test.ts` — end-to-end: traversal names exit 1, tree snapshot unchanged; valid name still removes only its dir
- `CLAUDE.md` — the `lib/pharn-config.ts` paragraph ("`name`/`role` stay unvalidated") updated to the new truth (P4)
- `SECURITY.md` — list `pharn.config.json` `capabilities[]` beside records/lock as validated local input, if SECURITY.md enumerates them (P4)

## Contracts satisfied

- CLAUDE.md "`lib/validate.ts` is security-sensitive" — names validated against `CAPABILITY_NAME_RE`, `..` rejected, control chars rejected; `safeJoin` containment preserved.
- README "Safety model": `remove` "deletes only the selected capability directory" — now floor-backed.

## Evals to write (P1)

- `safeChildJoin(base,'a11y')` → `base/a11y`; `'..'`, `'.'`, `''`, `'a/b'`, `'../x'`, `'/abs'` → throw
- `readPharnConfig` with name `../..` / `../../src` / `..` / `.` / `""` / `a/b` / `"a\u001b[2J"` / non-string → `CapabilityEntryError` naming `capabilities[i].name`
- role `"bogus"` / missing → `CapabilityEntryError` naming `capabilities[i].role`
- non-object entry → `CapabilityEntryError`
- valid archetype config (with and without `source`) and a legacy module config (no `capabilities`) still load byte-for-byte as before (P7)
- `loadConfigOrExit` / `list --json` route the new error to the named message + exit 1
- `runRemove('../..')` on a crafted config → exit 1, project tree snapshot (incl. `.git`, `src/`) unchanged
- `deleteCapabilityDir` defense-in-depth: even if validation were bypassed, `safeChildJoin` refuses (unit via `safeChildJoin`)
- `runRemove('a11y')` still deletes only `<lenses>/a11y`, sibling `a11y-extended` intact

## Guarantee audit (P0)

- "a config capability name is a single kebab segment" → floor: enum-regex (`CAPABILITY_NAME_RE` + `CONTROL_CHARS_RE`) at ingest
- "role is griller|lens" → floor: enum membership (`ROLE_VALUES`)
- "`remove` deletes only a strict child of the role subtree" → floor: path-containment (`safeChildJoin`: `dirname(target) === base`) layered on `safeJoin`
- symlinked components (PHARN-02) → NOT claimed here; separate increment

## Trust audit (P2)

- `pharn.config.json` is committed, hand-editable → treated as untrusted local input; taint stops at
  ingest (named error, exit 1, zero writes); downstream consumers (`remove`, `list`, `update`, `status`,
  `add`) only ever see validated names, which also closes raw-ESC echo of names in `list`.

## Determinism audit (P5)

- All branches are regex/enum membership or an exact string compare (`dirname === base`); failure is a
  named hard-fail, never a fallback.

## P7 note

Every `name` this CLI ever wrote came from `parseCapabilityIndex` (already `CAPABILITY_NAME_RE`-validated)
and every `role` from `assertRole`, so no legitimately written config is newly rejected. Pre-archetype
configs have no `capabilities` and are untouched.

## Open questions (HALT)

- none
