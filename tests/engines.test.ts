import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// PHARN-06: `engines.node` said ">=20" while @clack/prompts and @clack/core —
// runtime dependencies — declare ">= 20.12.0" and import `styleText` from
// node:util, so on Node 20.0–20.11 even `pharn --version` died at load time.
// The CLI's declared floor can never be lower than any runtime dependency's.
//
// A DECLARED floor can itself be wrong, which is why the second half of this
// file reads the dependencies' shipped code as well (see KNOWN_API_FLOORS).
//
// Reads the INSTALLED manifests (what the lockfile resolves). A consumer
// resolving the ^ ranges fresh may get a newer dependency with a higher floor —
// the separate `Smoke (node floor)` workflow is the runtime check for that.

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

/** Every installed runtime dependency, transitively: name, dir, engines.node. */
function runtimeDependencies(): {
  name: string;
  dir: string;
  range?: string;
}[] {
  const out: { name: string; dir: string; range?: string }[] = [];
  const seen = new Set<string>();
  const visit = (manifestPath: string): void => {
    const pkg = readJson(manifestPath);
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      const depManifest = findInstalled(dirname(manifestPath), dep);
      if (seen.has(depManifest)) continue;
      seen.add(depManifest);
      const depPkg = readJson(depManifest);
      out.push({
        name: depPkg.name,
        dir: dirname(depManifest),
        range: depPkg.engines?.node,
      });
      visit(depManifest);
    }
  };
  visit(join(root, 'package.json'));
  return out;
}

/** Every runtime dependency (transitively) with its declared engines.node. */
function runtimeFloors(): { name: string; range: string }[] {
  return runtimeDependencies().flatMap(({ name, range }) =>
    range ? [{ name, range }] : [],
  );
}

// A dependency's DECLARED floor can be wrong. @clack/prompts 1.8.1 declares
// ">= 20.12.0" but passes an ARRAY of formats to util.styleText, which Node
// accepts only from 20.13.0 (measured: 20.12.0 throws ERR_INVALID_ARG_VALUE,
// 20.13.0 styles). Most of those calls render a CANCELLED prompt, so on 20.12.x
// an Esc / Ctrl-C at a pharn confirmation (or at a picker with something
// selected) crashed with a stack trace instead of exiting 0. So the floor is
// also held to what the dependencies' shipped CODE calls: each row is a Node API
// usage whose minimum version was measured.
//
// Reach, stated exactly: a call by its literal name. An aliased import
// (`import { styleText as s }`) is not seen — both @clack packages import it by
// name today. A usage no row names is not seen at all; that residual stays with
// the smoke workflow.
const KNOWN_API_FLOORS: {
  usage: string;
  pattern: RegExp;
  floor: [number, number, number];
}[] = [
  {
    usage: 'util.styleText with an array of formats',
    pattern: /\bstyleText\s*\(\s*\[/,
    floor: [20, 13, 0],
  },
];

/** The KNOWN_API_FLOORS rows whose usage appears in `code`. */
function usagesIn(code: string): (typeof KNOWN_API_FLOORS)[number][] {
  return KNOWN_API_FLOORS.filter((row) => row.pattern.test(code));
}

/** A package's shipped JS files, never descending into a nested node_modules. */
function shippedJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...shippedJs(path));
    else if (entry.isFile() && /\.(?:m|c)?js$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Every known API usage found in the runtime dependencies' shipped code. */
function codeFloors(): {
  scanned: Map<string, number>;
  found: { name: string; usage: string; floor: [number, number, number] }[];
} {
  const scanned = new Map<string, number>();
  const found: {
    name: string;
    usage: string;
    floor: [number, number, number];
  }[] = [];
  for (const { name, dir } of runtimeDependencies()) {
    const files = shippedJs(dir);
    scanned.set(name, files.length);
    for (const file of files) {
      for (const row of usagesIn(readFileSync(file, 'utf8'))) {
        found.push({ name, usage: row.usage, floor: row.floor });
      }
    }
  }
  return { scanned, found };
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

  it('is never below what a runtime dependency’s shipped code needs', () => {
    for (const { name, usage, floor } of codeFloors().found) {
      expect(
        cmp(lowerBound(ours)!, floor),
        `${name} calls ${usage} (needs node >= ${floor.join('.')}), package.json says ${ours}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  // Without this, a scan that silently read nothing (a moved dist dir, a
  // changed walk) would pass the test above vacuously.
  it('actually reads @clack/prompts’ shipped code', () => {
    expect(codeFloors().scanned.get('@clack/prompts') ?? 0).toBeGreaterThan(0);
  });

  it('matches the README badge', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const [maj, min, pat] = lowerBound(ours)!;
    expect(readme).toContain(`node-%3E%3D${maj}.${min}.${pat}-`);
  });

  // node-floor.yml starts the packed CLI on `FLOOR`. A FLOOR above the declared
  // bound would smoke-test a Node the published range does not bottom out at.
  it('is the exact Node the smoke workflow runs', () => {
    const workflow = readFileSync(
      join(root, '.github', 'workflows', 'node-floor.yml'),
      'utf8',
    );
    const floor = /^\s*FLOOR:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(
      workflow,
    )?.[1];
    expect(floor).toBe(lowerBound(ours)!.join('.'));
  });
});

// The scanner itself, on planted text: it must fire on the array form and stay
// quiet on the single-format form, or the live check above could pass because
// the pattern never matches anything.
describe('KNOWN_API_FLOORS scanner', () => {
  it('fires on the array form, however it is spaced', () => {
    expect(usagesIn('styleText(["strikethrough", "dim"], label)')).toHaveLength(
      1,
    );
    expect(usagesIn('styleText (\n  [ "gray" ], x)')).toHaveLength(1);
  });

  it('stays quiet on the single-format form', () => {
    expect(usagesIn('styleText("dim", label)')).toEqual([]);
  });

  // Documented reach, pinned so a reader does not assume more: an aliased
  // import is outside what a name scan can see.
  it('does not see an aliased import', () => {
    expect(usagesIn('s(["strikethrough", "dim"], label)')).toEqual([]);
  });
});
