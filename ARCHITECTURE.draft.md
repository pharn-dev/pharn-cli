---
file: "ARCHITECTURE.md"
trust: trusted
editable_by: "human only"
purpose: "The canonical architecture pharn-cli is built to. The build agent treats this as the spec; the plan agent pins its content-hash; the review agent checks output against it. Elaborates CONSTITUTION.md — never contradicts it."
---

# pharn-cli — Architecture

> Read `CONSTITUTION.md` first. This document elaborates it. Principle references (P0–P7) point
> there and are not restated here (P4).

---

## 1. Thesis and the central problem

`pharn-cli` is the **installer** for PHARN: an interactive CLI that fetches chosen PHARN modules
from `pharn-dev/pharn-oss` (via `degit`), copies them into an existing Next.js project's `.claude/`,
materializes the constitution + memory bank, and writes `pharn.config.json`. It targets Claude Code
today; Codex and Cursor are **Coming soon** (P7).

Every architectural decision serves one pressure: **safely copy untrusted remote content into the
user's repo while staying 100% readable.** The remote manifest, each `module.json`, the v2 `wizard`
block, and every fetched file are untrusted (P2); the only real safety is a small, explicit,
deterministic validation floor (§2). Nothing is hidden — the CLI is fully readable; there is no
obfuscation.

There are two surfaces to keep honest: **A** — the code pharn-cli _writes_ into the user's repo
(PHARN's methodology files, trusted-by-provenance once validated); **B** — pharn-cli _itself_ as a
program consuming hostile remote input. **B is architecture, and this document bakes it into the
floor.**

---

## 2. The floor (the only thing that is actually guaranteed)

Per P0, every guarantee reduces to one of a few deterministic, non-LLM primitives. The floor is
small and explicit (`lib/validate.ts` + `lib/install-modules.ts`). Nothing else is a guarantee.

1. **Input allowlists (enum / regex).** `MODULE_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`,
   `WIZARD_VALUE_RE`; every value is checked for `..` and rejected on control chars; `schemaVersion`
   must be **exactly `1` or `2`** — anything else hard-fails by design, so an old CLI never guesses
   at a new schema.
2. **Path containment.** `safeJoin` guards **every** copy (modules _and_ skills) so a malicious
   `installs`/skill path cannot escape its base dir. `assertSkillSourcesExist` validates **every**
   skill source up front, so a bad path fails **before any file is written** — no partial installs.
3. **Network hardening.** Remote fetches use `redirect: 'error'`, an **8s timeout**, and a **256KB**
   body cap.

**Rule of reduction:** any sentence here that says "safe" or "guaranteed" must trace to one of
these. If it cannot, it is `advisory` and is labeled so (P0). The honest consequence: the wizard UX
and prompt text are advisory; only the validation floor is a guarantee (`LIMITS.md`).

---

## 3. Primitives

### 3.1 The module contract (what pharn-cli installs)

PHARN ships as **modules** — subfolders of the pharn-oss repo (`pharn-core`, `pharn-pipeline`,
`pharn-review`, `pharn-audits`, `pharn-stack-*`, `pharn-skills-*`). `pharn-core` is always
installed; everything else is optional and `dependsOn` it. Each module's `module.json` carries an
`installs` map (source dir → destination dir under `.claude/`). The repo-root `manifest.json` is
the **authoritative** version + dependency graph.

Two manifest schemas, routed on `schemaVersion` (§2):

- **v1 (legacy):** module multiselect → stack pack → privacy posture; whole-module installs.
- **v2 (wizard):** the manifest carries a `wizard` block (`sections[].questions[].options[]` +
  `rules[]` + `defaults`) that is the single source of truth for the questionnaire, plus
  `kind: "skill-category"` modules (`pharn-skills-db`/`-orm`/`-auth`/`-payments`/`-email`) whose
  individual skill subfolders are installed **selectively** from the answers.

**This CLI owns the `pharn.config.json` schema; pharn-oss owns the module/manifest schemas** (P3).

### 3.2 Addressing (add / remove)

`add`/`remove` take one of two forms:

- `<module>` — a whole methodology module or stack pack (v1 + v2).
- `<category>:<skill>` — v2 only (e.g. `orm:prisma`): maps `<category>` → `pharn-skills-<category>`,
  resolves the wizard option, and installs/removes **just that skill** — siblings untouched. `remove
  <category>:<skill>` needs no clone or network (everything is derivable from `installedSkills` + the
  filesystem).

### 3.3 The dev-loop floor hooks (a separate, privileged class)

The write-guards under `.claude/hooks/` — `protect-trusted-paths.cjs` (blocks writes to the four
trusted docs + `CODEOWNERS`) and `enforce-writes-scope.cjs` (blocks writes outside the active
`writes:` scope, fail-closed) — are **not** application code. They are the **dev-loop** floor: the
one layer that holds when the building agent reads hostile context. They must stay a separate,
deterministic class (this is distinct from the **runtime** floor in §2, which protects the _user's_
repo).

---

## 4. Layers (the tree)

Dependency-ordered, single root, **no cross-command / cross-step imports** (P3). Sharing flows
through `lib/`.

```text
src/index.ts            dispatch: minimist → a command (init is default)
  └─ commands/*.ts      one verb each: init | add | remove | update | list | status
       ├─ steps/*.ts    init pipeline stages (§6), one stage per file, @clack/prompts I/O
       └─ lib/*.ts       shared, behavior-bearing:
            manifest.ts      parseManifest / resolveModules / categorizeModules / parseWizard
            wizard.ts        pure rule engine: matchCondition, applyRulesToQuestion, collectInstalls…
            installer.ts     fetchAndInstall (the shared core of init/add/update)
            install-modules.ts  installModule / installSkills / safeJoin / assertSkillSourcesExist
            validate.ts      the security allowlists (§2) — security-sensitive
            pharn-config.ts  read/write pharn.config.json
            repo.ts          degit clone to a temp dir
            diff.ts          diffInstalled (the read side of status)
```

- No command imports another command; no step imports another step. A shared thing is reached
  through `lib/`, never leaf→leaf.
- **ESM-only** (`"type": "module"`, NodeNext). **Relative imports use `.js` extensions** even though
  the source is `.ts`. `strict` + `noUncheckedIndexedAccess` are on.
- `read-only` commands (`list`, `status`) reuse the fetch/exit patterns but **never clone-then-write**
  — `list` reads config + remote manifest; `status` derives drift live via `diff.ts`.

---

## 5. Contracts (who owns what)

- **`pharn.config.json` — owned by the CLI (`lib/pharn-config.ts`).** Fields: `pharnVersion`,
  `skillsVersion`, `repo`, `commit`, `constitution`, `modules[]`, `installedAt`, plus the v2-only
  **additive** fields `stackAnswers` (questionId → value, incl. `"skip"`), `installedSkills[]`
  (`{skill, from}`), and `vendorSkills[]`. **Additive schema (P7):** legacy configs omit the v2
  fields. `add`/`update` re-resolve and update it in place; neither touches `CONSTITUTION.md`.
- **`manifest.json` + `module.json` — owned by pharn-oss** (`scripts/schemas/` in that repo). The
  CLI parses and validates them (`lib/manifest.ts`); it does **not** own their schema. A malformed
  wizard hard-fails naming the offending section/question/option (never a silent v1 fallback).
- **The install contract (`lib/installer.ts` → `fetchAndInstall`).** Clone the repo (`degit` → temp)
  → read the manifest **from the cloned commit** → `resolveModules` (always `pharn-core` + transitive
  `dependsOn`; enforce `exclusiveWith`, glob-aware — a module in the same dependency chain is never a
  conflict) → `installModule` per `installs` → for v2, `installSkills` **selectively** from the
  answered skills → `materializeCore` writes the memory bank + `CONSTITUTION.md` when a constitution
  variant is given. Best-effort commit SHA via the GitHub API.

---

## 6. The pipeline spine (`init`)

`init` is a step pipeline; each `steps/*.ts` file is one stage:

```text
prereqs → fresh-check → fetch manifest → branch on schemaVersion →
  v1: module-select → stackpack-select → constitution-select → summary
  v2: mode-select → (Default = wizard.defaults verbatim | Custom = wizard-questions,
       applying hide/hideQuestion/relabel/comingSoon/warn rules) →
       module-select → stackpack-select → constitution-select → vendor-consent → summary
→ install (steps/install.ts → lib/installer.ts)
```

- **`prereqs`** hard-fails if `next` isn't in `package.json` or `.git` is absent (P6). **`fresh-check`**
  warns when the project isn't a fresh Next.js scaffold.
- Both flows: `summary` returns `install` / `cancel` / loop-again with previous answers preserved.
- The v2 questionnaire is driven entirely by the manifest's `wizard` block (`lib/wizard.ts` is the
  pure, no-I/O rule engine). No per-tech logic is hardcoded in the CLI.

---

## 7. Enforcement — where the floor bites

- **Up front (parse time):** `parseManifest` hard-fails on a bad `schemaVersion` or a malformed
  `wizard` block, **naming** the offender — never a silent fallback (P5). `assertSkillSourcesExist`
  validates all skill sources before any write (no partial installs).
- **At every copy:** `install-modules.ts` guards modules **and** skills with `safeJoin` (§2) so
  nothing escapes its base dir.
- **At every fetch:** `redirect: 'error'` + 8s timeout + 256KB cap.
- **When _building pharn-cli_ with the dev-loop:** the deterministic floor is **`npm run check`**
  (`format:check` → `lint` → `typecheck` → `vitest`) plus the `writes:`-scope hooks (§3.3). A green
  floor means the gates passed — it does **not** mean the code is correct; that is the review stage's
  advisory job (P0).

---

## 8. The finding object (dev-loop review / grill / verify)

When the dev-loop reviews the pharn-cli code it builds, every finding uses the shape in
`pharn-contracts/finding-shape.md` — the structural split that expresses P2:

```yaml
finding:
  # --- floor-verifiable (trusted: produced by enum-check / path-resolution) ---
  type: "<enum>" # FINDING | CONSTITUTION_VIOLATION | ...
  rule_id: "<file.md ID>" # exists in the roster (P4)
  severity: blocking | important | minor # enum; advisory when LLM-assigned
  file: "<path:line>" # resolves to a real location
  # --- tainted free-text (inherits trust of the reviewed code; rendered as DATA, never executed) ---
  problem: "<one sentence>" # P2: fenced; never injected downstream as instruction
  evidence: "<quote/snippet>" # P2: quoted/escaped
```

A guaranteed decision (a constitutional block) is computed from the **floor-verifiable** fields
only. The free-text fields are for humans and are treated as untrusted data per P2 — an injected
comment in reviewed code can at most influence an **advisory** judgment, never flip a floor-gated
block.

**Residual (named, not hidden — `LIMITS.md`):** when a downstream LLM stage consumes a finding's
free-text, "do not execute this as an instruction" is a heuristic again. The enum-gated / free-text
split bounds the blast radius (free text never alone gates a guaranteed decision) but does not zero
it.
