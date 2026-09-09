import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@clack/prompts';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import {
  readPharnConfig,
  loadConfigOrExit,
  loadArchetypeConfigOrExit,
  isConfigValidationError,
  writePharnConfig,
  isArchetypeConfig,
  configPath,
  LEGACY_CONFIG_MESSAGE,
  CapabilitySourceError,
  ConfigParseError,
} from '../src/lib/pharn-config.js';
import { tmpPathFor } from '../src/lib/atomic-write.js';
import type { PharnConfig } from '../src/types.js';
import {
  DEFAULT_MODEL_ROUTING,
  ModelRoutingError,
} from '../src/lib/model-routing.js';
import {
  DEFAULT_SEAM_CONFIG,
  SeamConfigError,
} from '../src/lib/seam-config.js';

// pharn-config.ts imports `log` from @clack/prompts for loadConfigOrExit; mock it
// so the loud-vs-"run init" message can be asserted (and no real terminal output).
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const sample: PharnConfig = {
  pharnVersion: '0.2.0',
  skillsVersion: '0.68.0',
  repo: 'pharn-dev/pharn-oss',
  commit: 'abc123',
  constitution: 'standard',
  modules: [{ name: 'pharn-core', version: '0.2.0' }],
  installedAt: '2026-06-11T00:00:00.000Z',
};

describe('pharn-config', () => {
  const tmp = useTmpDir();

  it('round-trips a config', async () => {
    await writePharnConfig(tmp.path(), sample);
    expect(readPharnConfig(tmp.path())).toEqual(sample);
  });

  it('round-trips the additive layout field (pharn)', async () => {
    const withLayout: PharnConfig = { ...sample, layout: 'pharn' };
    await writePharnConfig(tmp.path(), withLayout);
    expect(readPharnConfig(tmp.path())).toEqual(withLayout);
  });

  it('loads a legacy config with NO layout field (P7 additive)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    const loaded = readPharnConfig(tmp.path());
    expect(loaded).toEqual(sample);
    expect(loaded && 'layout' in loaded).toBe(false);
  });

  it('drops a garbage layout value on read (→ flat downstream, P5)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({ ...sample, layout: 'sideways' }),
    );
    const loaded = readPharnConfig(tmp.path());
    expect(loaded && 'layout' in loaded).toBe(false);
  });

  it('returns null when no config exists', () => {
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  // FLIPPED (audit P-7). This used to assert `null` — the SAME value that means
  // "there is no file" — so a stray comma was reported as a MISSING config and
  // answered with `pharn init`, which overwrites it. Present-but-unparseable is
  // now its own named failure; see the dedicated describe below.
  it('THROWS (not null) when the file exists but is not JSON', () => {
    writeFileSync(join(tmp.path(), 'pharn.config.json'), '{ not json');
    expect(() => readPharnConfig(tmp.path())).toThrow(ConfigParseError);
  });

  // The deliberate boundary of that change (P7): an UNREADABLE file keeps the old
  // `null`. A directory planted at the config path exists but fails `readFileSync`
  // with EISDIR — a permissions/shape problem, not a syntax one, and mislabelling
  // it as bad JSON would be a new lie in place of the old one. Pinned so a later
  // widening is a deliberate act rather than a drift.
  it('still returns null when the file exists but cannot be READ', () => {
    mkdirSync(join(tmp.path(), 'pharn.config.json'));
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  it('returns null when the shape is wrong (hand-edited config)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({ skillsVersion: '0.1.0', modules: 'oops' }),
    );
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  it('round-trips a config with a valid models block', async () => {
    const withModels: PharnConfig = {
      ...sample,
      models: DEFAULT_MODEL_ROUTING,
    };
    await writePharnConfig(tmp.path(), withModels);
    expect(readPharnConfig(tmp.path())).toEqual(withModels);
  });

  it('THROWS (naming the offender), not null, when the models block is invalid (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        models: { default: { model: 'gpt-4', effort: 'high' } },
      }),
    );
    expect(() => readPharnConfig(tmp.path())).toThrow(ModelRoutingError);
    expect(() => readPharnConfig(tmp.path())).toThrow(/gpt-4/);
  });

  it('round-trips a config with a valid seam block', async () => {
    const withSeam: PharnConfig = {
      ...sample,
      seam: DEFAULT_SEAM_CONFIG,
    };
    await writePharnConfig(tmp.path(), withSeam);
    expect(readPharnConfig(tmp.path())).toEqual(withSeam);
  });

  it('THROWS (naming the offender), not null, when the seam block is invalid (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        seam: { resolutionOrder: ['official-skill', 'model', 'fetch'] },
      }),
    );
    expect(() => readPharnConfig(tmp.path())).toThrow(SeamConfigError);
    expect(() => readPharnConfig(tmp.path())).toThrow(/ask/);
  });

  it('THROWS naming an unknown key in the seam block — raw does NOT survive (BUG 2/BUG 3)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        seam: { resolutionOrder: ['ask'], EXTRA: 'x' },
      }),
    );
    // The loader returns the validators' result, not `raw` — so an unknown key is
    // rejected (named), never carried verbatim into the runtime config.
    expect(() => readPharnConfig(tmp.path())).toThrow(/EXTRA/);
  });

  it('round-trips the schemaVersion 2 additive fields (incl. skip answers)', async () => {
    const v2: PharnConfig = {
      ...sample,
      skillsVersion: '0.69.0',
      stackAnswers: {
        database: 'supabase',
        orm: 'drizzle',
        auth: 'better-auth',
        email: 'resend',
        payments: 'skip',
      },
      installedSkills: [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        { skill: 'better-auth', from: 'pharn-skills-auth/skills/better-auth' },
        { skill: 'resend', from: 'pharn-skills-email/skills/resend' },
      ],
    };
    await writePharnConfig(tmp.path(), v2);
    const read = readPharnConfig(tmp.path());
    expect(read).toEqual(v2);
    expect(read?.stackAnswers?.payments).toBe('skip');
  });

  it('still reads a legacy config that predates the archetype fields (P7)', async () => {
    // `sample` is a legacy module install (constitution + modules, no archetypes).
    await writePharnConfig(tmp.path(), sample);
    const read = readPharnConfig(tmp.path());
    expect(read?.constitution).toBe('standard');
    expect(read?.archetypes).toBeUndefined();
    expect(read?.capabilities).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // capabilities[].source — the FIRST capabilities-entry check this config has.
  // Validates `source` ONLY; name/role stay unvalidated (a separate axis, P7).
  // -------------------------------------------------------------------------
  describe('capabilities[].source ingest', () => {
    stubProcessExit();
    const withCaps = (caps: unknown[]) => ({
      pharnVersion: '0.4.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: null,
      modules: [],
      installedAt: '2026-08-07T00:00:00.000Z',
      archetypes: ['ssr'],
      capabilities: caps,
    });

    const writeRaw = (value: unknown): void => {
      writeFileSync(
        join(tmp.path(), 'pharn.config.json'),
        JSON.stringify(value, null, 2),
      );
    };

    it('round-trips a valid source through load/save unreconstructed', async () => {
      writeRaw(
        withCaps([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ]),
      );
      expect(readPharnConfig(tmp.path())?.capabilities).toEqual([
        { name: 'a11y', role: 'griller', source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ]);
    });

    it('accepts an ABSENT source (legacy config, P7 additive)', () => {
      writeRaw(withCaps([{ name: 'a11y', role: 'griller' }]));
      expect(readPharnConfig(tmp.path())?.capabilities).toEqual([
        { name: 'a11y', role: 'griller' },
      ]);
    });

    it('THROWS a named error for a source outside the enum, naming the offender', () => {
      writeRaw(
        withCaps([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'x', role: 'lens', source: 'automatic' },
        ]),
      );
      expect(() => readPharnConfig(tmp.path())).toThrow(CapabilitySourceError);
      expect(() => readPharnConfig(tmp.path())).toThrow(
        /capabilities\[1\]\.source/,
      );
    });

    it('THROWS for a wrong-typed source', () => {
      writeRaw(withCaps([{ name: 'a11y', role: 'griller', source: 7 }]));
      expect(() => readPharnConfig(tmp.path())).toThrow(CapabilitySourceError);
    });

    it('joins isConfigValidationError, so it reports loudly instead of the "run init" lie', () => {
      expect(isConfigValidationError(new CapabilitySourceError('x'))).toBe(
        true,
      );
      writeRaw(withCaps([{ name: 'a11y', role: 'griller', source: 'nope' }]));
      expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
      expect(vi.mocked(log.error).mock.calls.map(String).join()).toContain(
        'capabilities[0].source',
      );
    });
  });

  it('still loads a config carrying a removed vendorSkills key (P7 additive)', async () => {
    // A config written by an older CLI may carry the now-removed vendorSkills
    // field; the passthrough loader ignores unknown keys and still reads it.
    const withRemovedField = {
      ...sample,
      vendorSkills: ['supabase'],
    } as PharnConfig & { vendorSkills: string[] };
    await writePharnConfig(tmp.path(), withRemovedField);
    const read = readPharnConfig(tmp.path());
    expect(read?.skillsVersion).toBe(sample.skillsVersion);
    expect(read?.constitution).toBe('standard');
  });

  it('round-trips an archetype install config (no constitution, modules:[], capabilities)', async () => {
    const archetypeConfig: PharnConfig = {
      pharnVersion: '0.2.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: 'sha123',
      modules: [],
      installedAt: '2026-07-07T00:00:00.000Z',
      archetypes: ['ssr', 'backend'],
      capabilities: [
        { name: 'a11y', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ],
    };
    await writePharnConfig(tmp.path(), archetypeConfig);
    const read = readPharnConfig(tmp.path());
    expect(read).toEqual(archetypeConfig);
    // No constitution variant is recorded for an archetype install.
    expect(read?.constitution).toBeUndefined();
  });
});

// Audit finding P-7. `!existsSync → null` and the `JSON.parse` catch `→ null`
// were indistinguishable at both call sites, so a config with a stray comma was
// answered with "No pharn.config.json found. Run `pharn init` first." — a line
// whose two halves are BOTH false: the file is right there, and re-running init
// overwrites it (resetting hand-edited models/seam and re-stamping every
// capability `source: 'auto'`, losing the manual-add provenance only this file
// remembers). These tests pin the message the user now gets instead, and — just
// as importantly — pin what must NEVER be in it.
describe('ConfigParseError — a corrupt config is reported as corrupt, not absent', () => {
  const tmp = useTmpDir();
  const write = (bytes: string) =>
    writeFileSync(join(tmp.path(), 'pharn.config.json'), bytes);
  const thrownMessage = (): string => {
    try {
      readPharnConfig(tmp.path());
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('expected readPharnConfig to throw');
  };

  it('names the file by its absolute path and says it is not valid JSON', () => {
    write('{ "a": 1, }');
    const msg = thrownMessage();
    // toContain, not a RegExp: a Windows path is full of regex escapes.
    expect(msg).toContain(configPath(tmp.path()));
    expect(msg).toContain('is not valid JSON');
  });

  // The whole point of the finding. The old sentence prescribed a command that
  // destroys the file it complains about; the new one warns against it and
  // offers a remedy that keeps the bytes.
  it('never tells the user to run the command that would overwrite the file', () => {
    write('{ "a": 1, }');
    const msg = thrownMessage();
    expect(msg).not.toContain('No pharn.config.json found');
    expect(msg).toContain('Do NOT run `pharn init`');
    expect(msg).toContain('move it aside first');
  });

  // A stray comma is far cheaper to fix when you are told WHERE it is. V8 puts
  // the position in its message; only these two integers are lifted out of it.
  it('surfaces the line and column when V8 supplies them', () => {
    write('{\n  "a": 1,\n}\n');
    expect(thrownMessage()).toContain('(line 3, column 1)');
  });

  // Degrade honestly (P5): `Unexpected end of JSON input` carries no position, so
  // the clause is omitted rather than invented.
  it('omits the location when V8 supplies none, rather than inventing one', () => {
    write('');
    const msg = thrownMessage();
    expect(msg).toContain('is not valid JSON.');
    // The clause shape, not the bare word: the message interpolates a mkdtemp
    // path, whose random suffix could contain any substring by chance.
    expect(msg).not.toMatch(/\(line \d/);
  });

  // P2. V8's OTHER message shape ECHOES RAW FILE BYTES: parsing "\x1b[31mBOOM"
  // yields `Unexpected token '\x1b', "\x1b[31mBOOM" is not valid JSON`. This is
  // the test that fails the day someone "improves" the message by appending
  // err.message — which would turn a hand-editable local file into terminal
  // escape injection through an error line.
  it('leaks NO file content into the message — not even one byte', () => {
    write(`${String.fromCharCode(27)}[31mBOOM`);
    const msg = thrownMessage();
    expect(msg).not.toContain('BOOM');
    expect(msg).not.toContain(String.fromCharCode(27));
  });

  // The `$` anchor, as behaviour rather than as a comment. V8's content-echoing
  // shape always ends `" is not valid JSON`, so a file crafted to CONTAIN a
  // location literal can never have it read back out as this config's position.
  it('cannot be tricked into reporting a location planted in the file', () => {
    write('oops (line 999 column 999)');
    expect(thrownMessage()).not.toMatch(/\(line \d/);
  });

  // P2, the other half of the same channel. The message closes V8's parse text
  // against raw file bytes — but it also interpolates the config's own path, and
  // that path embeds the process working directory, whose name can carry ESC or a
  // newline on POSIX. Refusing one source and echoing the other would leave the
  // principle half-applied; these pin that it is not. (Raised by a reviewer on
  // the PR that introduced the message.)
  //
  // Skipped on win32, where neither byte is a legal filename character — the
  // hazard, and therefore the test, is POSIX-only. CI is ubuntu-only anyway
  // (docs/contributing.md).
  const posixOnly = it.skipIf(process.platform === 'win32');

  const inHostileDir = (name: string): string => {
    const dir = join(tmp.path(), name);
    mkdirSync(dir);
    writeFileSync(join(dir, 'pharn.config.json'), '{ "a": 1, }');
    try {
      readPharnConfig(dir);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('expected readPharnConfig to throw');
  };

  posixOnly('escapes an ESC byte in the cwd instead of emitting it', () => {
    const msg = inHostileDir(`evil${String.fromCharCode(27)}[31m`);
    expect(msg).not.toContain(String.fromCharCode(27));
    // Escaped, NOT stripped: a stripped path would name a directory that does
    // not exist, which is worse than useless in a "go fix this file" message.
    expect(msg).toContain('evil\\x1b[31m');
  });

  posixOnly('escapes a newline in the cwd, so stderr cannot be forged', () => {
    const msg = inHostileDir('evil\nnot-really-pharn:');
    expect(msg).not.toContain('\n');
    expect(msg).toContain('evil\\x0anot-really-pharn:');
  });

  it('joins isConfigValidationError, so both call sites report it loudly', () => {
    expect(isConfigValidationError(new ConfigParseError('x'))).toBe(true);
  });
});

describe('isArchetypeConfig', () => {
  it('is true for a capabilities-bearing config', () => {
    expect(
      isArchetypeConfig({
        ...sample,
        modules: [],
        capabilities: [{ name: 'a11y', role: 'griller' }],
      }),
    ).toBe(true);
  });

  it('is false for a legacy module config', () => {
    expect(isArchetypeConfig(sample)).toBe(false);
  });

  it('is false when capabilities is absent, even with empty modules', () => {
    // Empty modules alone is NOT the marker — only a `capabilities` array is.
    expect(isArchetypeConfig({ ...sample, modules: [] })).toBe(false);
  });
});

describe('loadConfigOrExit', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  afterEach(() => vi.mocked(log.error).mockClear());

  it('exits(1) with the offender-naming message (NOT "run init") on invalid models (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        models: { default: { model: 'gpt-4', effort: 'high' } },
      }),
    );
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/gpt-4/);
    expect(msg).not.toMatch(/pharn init/);
  });

  // The end-to-end shape of audit finding P-7, at the surface a user sees: a
  // corrupt config must NOT reach the "run init" branch, because that branch's
  // advice would overwrite the very file it is complaining about.
  it('exits(1) reporting the corrupt config, NOT "no config found" (P-7)', () => {
    writeFileSync(join(tmp.path(), 'pharn.config.json'), '{ "a": 1, }');
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toContain('is not valid JSON');
    expect(msg).toContain('(line 1, column 11)');
    expect(msg).not.toContain('No pharn.config.json found');
  });

  it('prints "run init" and exits(1) when the config is absent', () => {
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/pharn init/);
  });

  // FABLE 5.2 (second bullet): clack's log.* defaults to process.stdout, so
  // before this `pharn update --yes > out.log 2> err.log` in an uninitialised
  // directory left the operator grepping an EMPTY err.log for the cause. The
  // exact-args match is the point — every command suite mocks log.error with a
  // vi.fn(), which swallows a missing option silently.
  it('sends the fatal message to STDERR, not stdout', () => {
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    expect(log.error).toHaveBeenCalledWith(
      'No pharn.config.json found. Run `pharn init` first.',
      { output: process.stderr },
    );
  });

  it('returns the config when valid', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    expect(loadConfigOrExit(tmp.path())).toEqual(sample);
  });
});

describe('isConfigValidationError', () => {
  it('is true for the named validator errors, false for a plain Error (the config-vs-bug boundary)', () => {
    expect(isConfigValidationError(new ModelRoutingError('x'))).toBe(true);
    expect(isConfigValidationError(new SeamConfigError('x'))).toBe(true);
    expect(isConfigValidationError(new Error('x'))).toBe(false);
    expect(isConfigValidationError('nope')).toBe(false);
  });
});

describe('loadArchetypeConfigOrExit', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  afterEach(() => vi.mocked(log.error).mockClear());

  it('returns an archetype (capability) config unchanged', () => {
    const archetype: PharnConfig = {
      ...sample,
      modules: [],
      archetypes: ['ssr'],
      capabilities: [{ name: 'a11y', role: 'griller' }],
    };
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(archetype),
    );
    expect(loadArchetypeConfigOrExit(tmp.path())).toEqual(archetype);
  });

  it('rejects a legacy (module) config with the exact LEGACY_CONFIG_MESSAGE + exit(1)', () => {
    // `sample` is a legacy module install: modules present, no capabilities.
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    expect(() => loadArchetypeConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toBe(LEGACY_CONFIG_MESSAGE);
    // Single-sourced AND on stderr: the message stays byte-identical while the
    // stream moves (FABLE 5.2).
    expect(vi.mocked(log.error).mock.calls.at(-1)![1]).toEqual({
      output: process.stderr,
    });
    expect(msg).toMatch(/no longer supported/);
    expect(msg).toMatch(/pharn init/); // the remediation is to re-run init
  });

  it('exits(1) via loadConfigOrExit when the config is absent (unchanged)', () => {
    expect(() => loadArchetypeConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/pharn init/);
  });
});

// The config is written temp-then-rename (lib/atomic-write.ts). A torn write here
// is the worst failure the CLI can leave behind: it puts truncated JSON on disk,
// and until audit P-7 was fixed every command answered that by reporting the file
// as ABSENT and prescribing a re-init — which resets hand-edited `models`/`seam`
// and re-stamps every capability `source: 'auto'`, losing the manual-add
// provenance only this file remembers. Truncated JSON now raises
// `ConfigParseError` instead (see its describe above), so the two defences are
// layered: atomicity keeps that state unreachable, the named error makes it
// survivable if it is ever reached another way.
describe('writePharnConfig — atomic replacement', () => {
  const tmp = useTmpDir();
  const configFile = () => join(tmp.path(), 'pharn.config.json');

  it('writes the same bytes as before: 2-space JSON + trailing newline', async () => {
    await writePharnConfig(tmp.path(), sample);
    expect(readFileSync(configFile(), 'utf8')).toBe(
      `${JSON.stringify(sample, null, 2)}\n`,
    );
  });

  it('overwrites an existing config in place, leaving no temp sibling', async () => {
    await writePharnConfig(tmp.path(), sample);
    await writePharnConfig(tmp.path(), { ...sample, skillsVersion: '9.9.9' });
    expect(readdirSync(tmp.path())).toEqual(['pharn.config.json']);
    expect(readPharnConfig(tmp.path())?.skillsVersion).toBe('9.9.9');
  });

  // A directory planted at the temp path fails the write for ANY user —
  // deterministic, unlike a read-only-directory fixture a root runner writes
  // straight through.
  it('leaves the previous config intact and loadable when the write fails', async () => {
    await writePharnConfig(tmp.path(), sample);
    mkdirSync(tmpPathFor(configFile()), { recursive: true });

    await expect(
      writePharnConfig(tmp.path(), { ...sample, skillsVersion: '9.9.9' }),
    ).rejects.toThrow();

    // The whole point: the old config is still THERE and still parses, so no
    // command mistakes it for absent and prescribes a destructive re-init.
    expect(readPharnConfig(tmp.path())?.skillsVersion).toBe('0.68.0');
  });
});
