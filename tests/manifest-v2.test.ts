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
