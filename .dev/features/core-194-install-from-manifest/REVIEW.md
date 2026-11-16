# REVIEW — core-194-install-from-manifest

Advisory. Four lenses over the diff against `b66d1aa2` (`src/lib/upstream-manifest.ts` new; branch points in
`capability-index.ts`, `install-manifest.ts`, `install-capabilities.ts`, `upstream-models.ts`; `repo.ts` verify;
`install-surfaces.ts` outer bound; `hash.ts` `matchesRawSha256`; `init.ts` message). Floor-gate findings: none
(`validate` GREEN, `npm run check` GREEN).

## Security (P2)

```yaml
- type: FINDING
  rule_id: P2
  severity: advisory
  file: src/lib/install-surfaces.ts
  problem: "The outer bound takes any `pharn-*` entry under any `.claude/<dir>/` on its name alone; a user's own `pharn-*` file there could be named by a manifest."
  evidence: "isPharnOwnedPath: (b) below `.claude/<dir>/`, inside a `pharn-*` entry"
```

Accepted (GATE-1 decision 2): an existing unrecorded file at such a dest is backed up before it is overwritten (the
existing init/update rules), and the name rule is the one `pharn` already applies to commands and agents. Named in the
PLAN's guarantee audit as an advisory residual.

## Correctness (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: advisory
  file: src/lib/upstream-manifest.ts
  problem: "The manifest is re-read and re-validated at each branch point; a tree whose manifest changed between fetchRepo's verification and a later read would be validated again but not re-verified."
  evidence: "every branch point re-reads through readUpstreamManifest"
```

Accepted: the tree is this process's private `mkdtemp` dir (the clone invariant's premise); a writer there can already
change the files the sha256 covered. Same residual as the copy reading the clone after verification.

## Maintainability (P3/P4)

- One parser, one bound, one raw-hash check — no second validation path. The three name filters moved to
  `install-surfaces.ts` (re-exported by `install-manifest.ts`) to keep the import graph acyclic.
- Each derivation branch carries the v0.22.0 removal note.

## Tests (P1)

- Every refusal class has a case (`tests/upstream-manifest.test.ts`); the outer bound has a positive/negative table
  (`tests/orphans.test.ts`) with every existing row unchanged; the command suites prove the manifest is the source
  with fixtures that disagree with the derivation (a new surface, `models.defaults`, an undeclared file in a capability
  dir) and cover init, update (install → update → orphan), add, status and uninstall.

Advisory verdict: 2 concerns, both accepted with named residuals; no blocking finding.
