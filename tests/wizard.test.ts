import { describe, expect, it } from 'vitest';
import {
  applyDefaults,
  applyRulesToQuestion,
  collectInstalls,
  collectVendorSkills,
  describeAnswers,
  detectAnswers,
  findSkillOption,
  listSkillAddresses,
  matchCondition,
  pendingWarnings,
} from '../src/lib/wizard.js';
import { wizardSpec } from './wizard-fixture.js';
import type { WizardQuestion, WizardSpec } from '../src/types.js';

const wizard = wizardSpec();

function question(id: string): WizardQuestion {
  const q = wizard.sections[0]!.questions.find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}`);
  return q;
}

describe('matchCondition', () => {
  it.each([
    [{ database: 'supabase' }, { database: 'supabase' }, true],
    [{ database: 'supabase' }, { database: 'neon' }, false],
    [{ database: 'supabase' }, {}, false], // missing key fails equality
    [{ database: { not: 'supabase' } }, { database: 'neon' }, true],
    [{ database: { not: 'supabase' } }, { database: 'supabase' }, false],
    [{ database: { not: 'supabase' } }, {}, true], // missing key satisfies not
    [
      { auth: 'better-auth', orm: 'skip' },
      { auth: 'better-auth', orm: 'skip' },
      true,
    ],
    [
      { auth: 'better-auth', orm: 'skip' },
      { auth: 'better-auth', orm: 'drizzle' },
      false,
    ],
  ] as const)('matches %o against %o → %s', (cond, answers, expected) => {
    expect(matchCondition(cond, { ...answers })).toBe(expected);
  });
});

describe('applyRulesToQuestion', () => {
  it('hideQuestion: ORM is hidden when database is convex', () => {
    expect(
      applyRulesToQuestion(question('orm'), { database: 'convex' }).hidden,
    ).toBe(true);
    expect(
      applyRulesToQuestion(question('orm'), { database: 'supabase' }).hidden,
    ).toBe(false);
  });

  it('hide: supabase-auth option drops when database is not supabase', () => {
    const neon = applyRulesToQuestion(question('auth'), { database: 'neon' });
    expect(neon.options.map((o) => o.value)).not.toContain('supabase-auth');
    const supa = applyRulesToQuestion(question('auth'), {
      database: 'supabase',
    });
    expect(supa.options.map((o) => o.value)).toContain('supabase-auth');
  });

  it('relabel: resend is relabeled when auth is clerk', () => {
    const relabeled = applyRulesToQuestion(question('email'), {
      auth: 'clerk',
    });
    expect(relabeled.options.find((o) => o.value === 'resend')!.label).toBe(
      'Resend (via Clerk)',
    );
    const plain = applyRulesToQuestion(question('email'), {
      auth: 'better-auth',
    });
    expect(plain.options.find((o) => o.value === 'resend')!.label).toBe(
      'Resend',
    );
  });

  it('preserves comingSoon flags after rule application', () => {
    const { options } = applyRulesToQuestion(question('database'), {});
    expect(options.find((o) => o.value === 'convex')!.comingSoon).toBe(true);
  });
});

describe('pendingWarnings', () => {
  it('fires the no-ORM warning for better-auth + orm:skip', () => {
    expect(
      pendingWarnings(question('auth'), { auth: 'better-auth', orm: 'skip' }),
    ).toEqual(['No ORM selected — better-auth expects one.']);
  });

  it('stays silent when an ORM is chosen', () => {
    expect(
      pendingWarnings(question('auth'), {
        auth: 'better-auth',
        orm: 'drizzle',
      }),
    ).toEqual([]);
  });
});

describe('collectInstalls', () => {
  it('returns one skill per answered option with a non-null install', () => {
    const skills = collectInstalls(wizard, {
      database: 'neon',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'skip',
    });
    expect(skills).toEqual([
      { skill: 'neon', from: 'pharn-skills-db/skills/neon' },
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
      { skill: 'better-auth', from: 'pharn-skills-auth/skills/better-auth' },
      { skill: 'resend', from: 'pharn-skills-email/skills/resend' },
    ]);
  });

  it('ignores skip and install:null answers', () => {
    expect(
      collectInstalls(wizard, { database: 'supabase', payments: 'skip' }),
    ).toEqual([]);
  });
});

describe('collectVendorSkills', () => {
  it('collects vendorSkill of answered options', () => {
    expect(collectVendorSkills(wizard, { database: 'supabase' })).toEqual([
      {
        name: 'supabase',
        source: 'github:supabase/supabase-skills/database',
      },
    ]);
    expect(collectVendorSkills(wizard, { database: 'neon' })).toEqual([]);
  });
});

describe('applyDefaults', () => {
  it('returns wizard.defaults verbatim', () => {
    expect(applyDefaults(wizard)).toEqual({
      database: 'supabase',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    });
  });

  it('overlays detected answers over the defaults', () => {
    expect(applyDefaults(wizard, { orm: 'prisma' })).toEqual({
      database: 'supabase',
      orm: 'prisma',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    });
  });

  it('snaps a choice a hide rule removed back to the default option', () => {
    // database=neon triggers `hide supabase-auth`; the overlaid supabase-auth is
    // no longer selectable, so auth snaps to its default (better-auth).
    expect(
      applyDefaults(wizard, { database: 'neon', auth: 'supabase-auth' }),
    ).toEqual({
      database: 'neon',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    });
  });

  it('records a hideQuestion-hidden question as skip instead of its default', () => {
    const w: WizardSpec = {
      sections: [
        {
          id: 's',
          title: 'S',
          questions: [
            {
              id: 'database',
              prompt: 'DB',
              options: [
                {
                  value: 'supabase',
                  label: 'Supabase',
                  default: true,
                  install: null,
                },
                { value: 'sqlite', label: 'SQLite', install: null },
              ],
            },
            {
              id: 'orm',
              prompt: 'ORM',
              options: [
                {
                  value: 'drizzle',
                  label: 'Drizzle',
                  default: true,
                  install: null,
                },
                { value: 'skip', label: 'skip', install: null },
              ],
              rules: [{ type: 'hideQuestion', if: { database: 'sqlite' } }],
            },
          ],
        },
      ],
      defaults: { database: 'supabase', orm: 'drizzle' },
    };
    // sqlite hides the orm question, so its default (drizzle) is dropped to skip.
    expect(applyDefaults(w, { database: 'sqlite' })).toEqual({
      database: 'sqlite',
      orm: 'skip',
    });
  });
});

describe('describeAnswers', () => {
  it('maps answer values to option labels in question order', () => {
    // input order is irrelevant — output follows the wizard's question order.
    expect(
      describeAnswers(wizard, { orm: 'prisma', database: 'supabase' }),
    ).toEqual(['Supabase', 'Prisma']);
  });

  it('falls back to the raw value when no option matches', () => {
    expect(describeAnswers(wizard, { database: 'mystery' })).toEqual([
      'mystery',
    ]);
  });
});

describe('detectAnswers', () => {
  it('maps installed packages to the matching option per question', () => {
    expect(
      detectAnswers(wizard, new Set(['drizzle-orm', '@supabase/supabase-js'])),
    ).toEqual({ database: 'supabase', orm: 'drizzle' });
  });

  it('returns no answers when nothing matches', () => {
    expect(detectAnswers(wizard, new Set(['express']))).toEqual({});
  });

  it('ignores coming-soon options', () => {
    // convex carries detect: ['convex'] but is comingSoon — never auto-picked.
    expect(detectAnswers(wizard, new Set(['convex']))).toEqual({});
  });
});

describe('findSkillOption / listSkillAddresses', () => {
  it('resolves a category:skill to its install path', () => {
    expect(findSkillOption(wizard, 'orm', 'prisma')).toMatchObject({
      category: 'orm',
      module: 'pharn-skills-orm',
      skill: 'prisma',
      questionId: 'orm',
      install: 'pharn-skills-orm/skills/prisma',
    });
  });

  it('returns undefined for unknown category or skill', () => {
    expect(findSkillOption(wizard, 'orm', 'sequelize')).toBeUndefined();
    expect(findSkillOption(wizard, 'nope', 'drizzle')).toBeUndefined();
  });

  it('lists every installable address', () => {
    const addrs = listSkillAddresses(wizard).map(
      (a) => `${a.category}:${a.skill}`,
    );
    expect(addrs).toEqual([
      'db:neon',
      'orm:drizzle',
      'orm:prisma',
      'auth:better-auth',
      'auth:clerk',
      'auth:supabase-auth',
      'email:resend',
      'payments:stripe',
    ]);
  });
});
