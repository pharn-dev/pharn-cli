# PLAN — bounded-package-json (PHARN-15: archetype detection reads package.json safely and skips more heavy trees)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `readPackageSignals` opens `package.json` ONCE (`O_NONBLOCK`, so a FIFO cannot hang the open),
  checks `fstat().isFile()` on that descriptor, reads at most a fixed cap (larger → "not usable", like a
  parse error), and strips a leading UTF-8 BOM before `JSON.parse`. `SKIP_DIRS` gains `.venv`, `venv`,
  `vendor`, `target`, `.yarn`, `__pycache__`, so a large dependency/build tree cannot exhaust the walk
  budget before it reaches the project's source.
- layer(s): the CLI itself (`src/lib/detect-archetype.ts`)
- constitution_refs: [P1, P2, P4, P5]

## Discovery — verified this run (P6)

Review repro: a BOM-prefixed Next.js `package.json` → `JSON.parse` throws → `packageJsonFound: false`,
detected `lib` instead of `ssr`; a FIFO at `package.json` hangs `init` (8 s timeout in the repro); a
symlink to `/dev/zero` reads without bound (~1.5 GB); a `.venv` with 50k files exhausts `MAX_ENTRIES`
before `src/` → `lib`. Code: `existsSync` + `readFileSync(pkgPath)` (`detect-archetype.ts:169-171`);
`SKIP_DIRS` at `:70`. The same open/fstat/read-from-fd pattern exists in `readCapabilityMarkdown` and
`readMinCli`. A symlinked `package.json` in the user's own project stays FOLLOWED (legitimate); the
`isFile` + size cap is what bounds it.

## Files

- `src/lib/detect-archetype.ts` — fd-based bounded read + BOM strip; six new `SKIP_DIRS` members — layer CLI/lib
- `tests/detect-archetype.test.ts` — BOM → `ssr` + found; FIFO → returns promptly, not found; oversized →
  not found; a symlink to a regular file still read; `.venv` with a signal-free flood before `src/` still
  detects the source signal (the existing uniform SKIP_DIRS pins cover the new members)
- `docs/commands/init.md` — the skip list (P4)
- `docs/troubleshooting.md` — the skip list (P4)

## Contracts satisfied

- `docs/commands/init.md` "bounded and symlink-safe" — now also true of the package.json read.

## Evals to write (P1)

- listed above; BOM, FIFO, oversized and `.venv` cases fail on the base source.

## Guarantee audit (P0)

- "detection never blocks on or reads without bound from package.json" → floor: non-blocking open +
  descriptor type check + fixed-size buffer.

## Trust audit (P2)

- package.json content is still only JSON-parsed and reduced to dependency NAMES against allowlists.

## Determinism audit (P5)

- Same bytes → same result; a skipped dir is skipped by name, uniformly.

## Open questions (HALT)

- none
