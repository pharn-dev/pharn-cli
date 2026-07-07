// .dev/floor/lens-scanner-map.test.mjs — consistency guard for the explicit lens->scanner map.
//
// UNLIKE the other floor tests (which are hermetic over scratch fixtures), this one validates the
// COMMITTED artifact against REALITY: the live .dev/floor/ scanners on disk and the live `role: lens`
// membership from count-lenses.mjs. Its whole job is to make prose/map DRIFT a build failure (P7 — a
// real, already-observed drift: two lenses' Layer-1 prose name scan-code-*.mjs files that do not exist).
// It is deterministic (existence checks + set membership — ARCHITECTURE §2 primitive #3), no LLM.
//
// It asserts four things:
//   1. every NON-null scanner value resolves to an existing .dev/floor/<file>;
//   2. every counted lens (count-lenses.mjs) is a KEY in the map — no lens left unscoped;
//   3. every map KEY is a real counted lens — no phantom entry;
//   4. no ORPHAN scanner — every .dev/floor/scan-code-*.mjs is wired to some lens (a scanner added but
//      never mapped is a silent gap).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url)); // .dev/floor
const REPO = join(here, "..", ".."); // repo root
const MAP = JSON.parse(readFileSync(join(here, "lens-scanner-map.json"), "utf8"));

// live `role: lens` membership → the set of lens short-names (basename of the lens dir).
function countedLensNames() {
  const r = spawnSync(process.execPath, [join(here, "count-lenses.mjs"), REPO], { encoding: "utf8" });
  assert.equal(r.status, 0, "count-lenses.mjs must exit 0 over the repo");
  return JSON.parse(r.stdout).lenses.map((p) => basename(dirname(p)));
}

// live scan-code-*.mjs (excluding *.test.mjs) on disk.
function scannersOnDisk() {
  return readdirSync(here).filter((f) => f.startsWith("scan-code-") && f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
}

test("map parses and has a { scanners: {...} } object", () => {
  assert.equal(typeof MAP.scanners, "object");
  assert.ok(MAP.scanners && !Array.isArray(MAP.scanners));
});

test("1. every non-null scanner value resolves to an existing .dev/floor/ file", () => {
  for (const [lens, scanner] of Object.entries(MAP.scanners)) {
    if (scanner === null) continue;
    assert.equal(typeof scanner, "string", `${lens}: scanner must be a string or null`);
    assert.ok(existsSync(join(here, scanner)), `${lens}: mapped scanner does not exist on disk: ${scanner}`);
  }
});

test("2. every counted lens (role: lens) is a KEY in the map — no lens left unscoped", () => {
  const keys = new Set(Object.keys(MAP.scanners));
  for (const lens of countedLensNames()) {
    assert.ok(keys.has(lens), `lens '${lens}' is a role: lens capability but is missing from lens-scanner-map.json`);
  }
});

test("3. every map KEY is a real counted lens — no phantom entry", () => {
  const counted = new Set(countedLensNames());
  for (const lens of Object.keys(MAP.scanners)) {
    assert.ok(counted.has(lens), `map key '${lens}' is not a live role: lens capability (phantom / renamed?)`);
  }
});

test("4. no ORPHAN scanner — every scan-code-*.mjs on disk is wired to some lens", () => {
  const live = countedLensNames();
  if (live.length === 0) return; // pharn-cli ships floor scanners without product lenses — wiring is enforced once lenses exist
  const referenced = new Set(Object.values(MAP.scanners).filter(Boolean));
  for (const s of scannersOnDisk()) {
    assert.ok(referenced.has(s), `scanner '${s}' exists on disk but no lens maps to it (unwired scanner)`);
  }
});

test("map + reality agree on the live counts", () => {
  const live = countedLensNames();
  const entries = Object.entries(MAP.scanners);
  const mapped = entries.filter(([, s]) => s !== null).length;
  const scannerless = entries.filter(([, s]) => s === null).length;
  assert.equal(entries.length, live.length, "map key count must equal the live lens count");
  if (live.length === 0) return; // empty map is the honest state when no role: lens capabilities exist
  assert.equal(mapped, scannersOnDisk().length, "mapped-scanner count must equal scanners on disk (no orphan, no dangling)");
  assert.equal(scannerless >= 1, true, "scanner-less lenses exist and are honestly mapped to null");
});
