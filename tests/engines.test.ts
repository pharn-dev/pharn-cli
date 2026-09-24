import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// PHARN-06: `engines.node` said ">=20" while @clack/prompts and @clack/core —
// runtime dependencies — declare ">= 20.12.0" and import `styleText` from
// node:util, so on Node 20.0–20.11 even `pharn --version` died at load time.
// The CLI's declared floor can never be lower than any runtime dependency's.
//
// Reads the INSTALLED manifests (what the lockfile resolves). A consumer
// resolving the ^ ranges fresh may get a newer dependency with a higher floor —
// the separate `Smoke (node 20.12.0)` workflow is the runtime check for that.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) =>
  JSON.parse(readFileSync(p, 'utf8')) as {
    name: string;
    engines?: { node?: string };
    dependencies?: Record<string, string>;
  };

/** The lower bound of a `>=x[.y[.z]]` range, as [major, minor, patch]. */
function lowerBound(range: string): [number, number, number] | null {
  const m = /^\s*>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(range);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** Node's lookup: the nearest `node_modules/<dep>` walking up from `from`. */
function findInstalled(from: string, dep: string): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', dep, 'package.json');
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) throw new Error(`${dep} is not installed`);
  }
}

/** Every runtime dependency (transitively) with its declared engines.node. */
function runtimeFloors(): { name: string; range: string }[] {
  const out: { name: string; range: string }[] = [];
  const seen = new Set<string>();
  const visit = (manifestPath: string): void => {
    const pkg = readJson(manifestPath);
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      const depManifest = findInstalled(dirname(manifestPath), dep);
      if (seen.has(depManifest)) continue;
      seen.add(depManifest);
      const depPkg = readJson(depManifest);
      if (depPkg.engines?.node)
        out.push({ name: depPkg.name, range: depPkg.engines.node });
      visit(depManifest);
    }
  };
  visit(join(root, 'package.json'));
  return out;
}

describe('engines.node (PHARN-06)', () => {
  const ours = readJson(join(root, 'package.json')).engines?.node ?? '';

  it('is a plain >=x.y.z lower bound', () => {
    expect(lowerBound(ours)).not.toBeNull();
  });

  it('is never below a runtime dependency’s declared Node floor', () => {
    const floors = runtimeFloors();
    // @clack/* is what raised the real floor; if it stopped being found, this
    // test would pass vacuously.
    expect(floors.map((f) => f.name)).toContain('@clack/core');
    for (const { name, range } of floors) {
      const theirs = lowerBound(range);
      if (theirs === null) continue;
      expect(
        cmp(lowerBound(ours)!, theirs),
        `${name} needs node ${range}, package.json says ${ours}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('matches the README badge', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const [maj, min, pat] = lowerBound(ours)!;
    expect(readme).toContain(`node-%3E%3D${maj}.${min}.${pat}-`);
  });
});
