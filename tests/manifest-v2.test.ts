import { describe, expect, it } from 'vitest';
import { categorizeModules, parseManifest } from '../src/lib/manifest.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import { rawV2Manifest } from './wizard-fixture.js';

describe('parseManifest schemaVersion routing', () => {
  it('parses a schemaVersion 1 manifest with no wizard block', () => {
    const m = parseManifest({
      schemaVersion: 1,
      skillsVersion: '0.68.1',
      modules: [
        {
          name: 'pharn-core',
          version: '0.2.0',
          required: true,
          dependsOn: [],
          description: 'core',
        },
      ],
    });
    expect(m.schemaVersion).toBe(1);
    expect(m.wizard).toBeUndefined();
  });

  it('parses a valid schemaVersion 2 manifest with a wizard block', () => {
    const m = parseManifest(rawV2Manifest());
    expect(m.schemaVersion).toBe(2);
    expect(m.wizard?.sections[0]?.id).toBe('core');
    expect(m.wizard?.defaults.database).toBe('supabase');
    expect(m.modules.find((x) => x.name === 'pharn-skills-orm')?.kind).toBe(
      'skill-category',
    );
  });

  it('round-trips an option detect array', () => {
    const m = parseManifest(rawV2Manifest());
    const db = m.wizard?.sections[0]?.questions[0];
    const supabase = db?.options.find((o) => o.value === 'supabase');
    expect(supabase?.detect).toEqual(['@supabase/supabase-js']);
  });

  it('tolerates stray vendorSkill/source keys on an option (forward-compat)', () => {
    // A pinned/older schemaVersion 2 manifest may still ship these now-removed
    // keys; parse must not throw (P7 — old pins never break), and must not
    // surface them on the parsed option.
    const raw = rawV2Manifest();
    const options = (
      raw.wizard as {
        sections: { questions: { options: Record<string, unknown>[] }[] }[];
      }
    ).sections[0]!.questions[0]!.options;
    options[0]!.vendorSkill = 'supabase';
    options[0]!.source = 'github:supabase/supabase-skills/database';
    const supabase = parseManifest(
      raw,
    ).wizard?.sections[0]?.questions[0]?.options.find(
      (o) => o.value === 'supabase',
    ) as Record<string, unknown> | undefined;
    expect(supabase).toBeDefined();
    expect(supabase?.vendorSkill).toBeUndefined();
    expect(supabase?.source).toBeUndefined();
  });

  it('rejects unknown schema versions', () => {
    expect(() =>
      parseManifest({ schemaVersion: 3, skillsVersion: '1.0.0', modules: [] }),
    ).toThrow(ManifestValidationError);
  });

  it('ignores non-question metadata keys in wizard.defaults', () => {
    const raw = rawV2Manifest();
    (raw.wizard as { defaults: Record<string, string> }).defaults.comment =
      'Default mode answers — wizard skips all questions and uses these.';
    const m = parseManifest(raw);
    expect(m.wizard?.defaults.comment).toBeUndefined();
    expect(m.wizard?.defaults.database).toBe('supabase');
  });

  it('still validates the value of a real question-id default', () => {
    const raw = rawV2Manifest();
    (raw.wizard as { defaults: Record<string, string> }).defaults.database =
      'Bad Value';
    expect(() => parseManifest(raw)).toThrow(/wizard\.defaults\["database"\]/);
  });

  it('rejects a default pointing at a value that is not an option', () => {
    const raw = rawV2Manifest();
    // 'mysql' is a valid value shape but not an option of the database question.
    (raw.wizard as { defaults: Record<string, string> }).defaults.database =
      'mysql';
    expect(() => parseManifest(raw)).toThrow(
      /is not an option of question "database"/,
    );
  });

  it('rejects a duplicate question id across sections', () => {
    const raw = rawV2Manifest();
    const sections = (
      raw.wizard as { sections: Array<{ questions: Array<{ id: string }> }> }
    ).sections;
    // Collide the ORM question's id onto the database question's id.
    sections[0]!.questions[1]!.id = 'database';
    expect(() => parseManifest(raw)).toThrow(
      /duplicate question id "database"/,
    );
  });
});

describe('parseWizard validation', () => {
  function withWizard(
    mutate: (w: Record<string, unknown>) => void,
  ): () => void {
    const raw = rawV2Manifest();
    mutate(raw.wizard as Record<string, unknown>);
    return () => parseManifest(raw);
  }

  it('throws naming the section when sections are missing', () => {
    expect(
      withWizard((w) => {
        delete w.sections;
      }),
    ).toThrow(/wizard\.sections/);
  });

  it('throws naming the question when a question id is invalid', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ id: unknown }>;
        }>;
        sections[0]!.questions[0]!.id = 'Bad Id';
      }),
    ).toThrow(/wizard\.sections\[0\]\.questions\[0\]\.id/);
  });

  it('throws when an option install points at an unknown module', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ options: Array<{ install: unknown }> }>;
        }>;
        sections[0]!.questions[1]!.options[0]!.install =
          'pharn-skills-ghost/skills/x';
      }),
    ).toThrow(/does not start with a known module/);
  });

  it('throws when an option install is rooted at a non-skill module', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ options: Array<{ install: unknown }> }>;
        }>;
        // pharn-core is a known module but not a pharn-skills-* category, so the
        // option would not be addressable via `add <category>:<skill>`.
        sections[0]!.questions[1]!.options[0]!.install = 'pharn-core/skills/x';
      }),
    ).toThrow(/pharn-skills-/);
  });

  it('throws when a relabel rule omits its label', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ rules?: Array<Record<string, unknown>> }>;
        }>;
        const emailRules = sections[0]!.questions[3]!.rules!;
        delete emailRules[0]!.label;
      }),
    ).toThrow(ManifestValidationError);
  });

  it('throws on an unknown rule type', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ rules?: Array<Record<string, unknown>> }>;
        }>;
        sections[0]!.questions[1]!.rules![0]!.type = 'destroy';
      }),
    ).toThrow(/hide \| hideQuestion \| relabel \| warn/);
  });

  it('throws on a malformed condition value', () => {
    expect(
      withWizard((w) => {
        const sections = w.sections as Array<{
          questions: Array<{ rules?: Array<{ if: Record<string, unknown> }> }>;
        }>;
        sections[0]!.questions[1]!.rules![0]!.if = { database: { nope: 'x' } };
      }),
    ).toThrow(/must be a string or \{ not: string \}/);
  });

  type Mut = (w: Record<string, unknown>) => void;
  const sectionsOf = (w: Record<string, unknown>) =>
    w.sections as Array<{
      title?: unknown;
      questions: Array<{
        prompt?: unknown;
        options: Array<Record<string, unknown>>;
        rules?: Array<Record<string, unknown>>;
      }>;
    }>;

  it('throws when the wizard block is not an object', () => {
    const raw = rawV2Manifest();
    raw.wizard = 'nope';
    expect(() => parseManifest(raw)).toThrow(/wizard must be an object/);
  });

  it.each<[string, Mut]>([
    ['defaults missing', (w) => delete w.defaults],
    ['section title missing', (w) => delete sectionsOf(w)[0]!.title],
    [
      'question prompt missing',
      (w) => delete sectionsOf(w)[0]!.questions[0]!.prompt,
    ],
    [
      'option value invalid',
      (w) => (sectionsOf(w)[0]!.questions[0]!.options[0]!.value = 'Bad Value'),
    ],
    [
      'option default not boolean',
      (w) => (sectionsOf(w)[0]!.questions[0]!.options[0]!.default = 'yes'),
    ],
    [
      'option comingSoon not boolean',
      (w) => (sectionsOf(w)[0]!.questions[0]!.options[2]!.comingSoon = 'soon'),
    ],
    [
      'hide rule missing options',
      (w) => delete sectionsOf(w)[0]!.questions[2]!.rules![0]!.options,
    ],
    [
      'warn rule missing message',
      (w) => delete sectionsOf(w)[0]!.questions[2]!.rules![1]!.message,
    ],
    [
      'condition empty object',
      (w) => (sectionsOf(w)[0]!.questions[1]!.rules![0]!.if = {}),
    ],
    [
      'option detect not an array',
      (w) => (sectionsOf(w)[0]!.questions[0]!.options[0]!.detect = 'next'),
    ],
    [
      'option detect with a bad package name',
      (w) =>
        (sectionsOf(w)[0]!.questions[0]!.options[0]!.detect = ['Bad Name']),
    ],
    [
      'option detect containing ..',
      (w) => (sectionsOf(w)[0]!.questions[0]!.options[0]!.detect = ['a..b']),
    ],
  ])('rejects: %s', (_label, mutate) => {
    const raw = rawV2Manifest();
    mutate(raw.wizard as Record<string, unknown>);
    expect(() => parseManifest(raw)).toThrow(ManifestValidationError);
  });
});

describe('categorizeModules excludes skill categories', () => {
  it('keeps skill-category modules out of the optional list', () => {
    const m = parseManifest(rawV2Manifest());
    const { optional } = categorizeModules(m);
    const names = optional.map((x) => x.name);
    expect(names).toContain('pharn-pipeline');
    expect(names).not.toContain('pharn-skills-orm');
    expect(names).not.toContain('pharn-skills-db');
  });
});
