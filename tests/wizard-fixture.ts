import type { Manifest, ManifestModule, WizardSpec } from '../src/types.js';

// Canonical schemaVersion 2 wizard used across tests. Mirrors the spec examples:
// database/orm/auth/email/payments with hide / hideQuestion / relabel / warn rules.
export function wizardSpec(): WizardSpec {
  return {
    sections: [
      {
        id: 'core',
        title: 'CORE',
        questions: [
          {
            id: 'database',
            prompt: 'Database',
            options: [
              {
                value: 'supabase',
                label: 'Supabase',
                default: true,
                install: null,
                detect: ['@supabase/supabase-js'],
              },
              {
                value: 'neon',
                label: 'Neon',
                install: 'pharn-skills-db/skills/neon',
                detect: ['@neondatabase/serverless'],
              },
              {
                value: 'convex',
                label: 'Convex',
                install: null,
                comingSoon: true,
                detect: ['convex'],
              },
              { value: 'skip', label: 'skip', install: null },
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
                install: 'pharn-skills-orm/skills/drizzle',
                detect: ['drizzle-orm'],
              },
              {
                value: 'prisma',
                label: 'Prisma',
                install: 'pharn-skills-orm/skills/prisma',
                detect: ['prisma', '@prisma/client'],
              },
              { value: 'skip', label: 'skip', install: null },
            ],
            rules: [{ type: 'hideQuestion', if: { database: 'convex' } }],
          },
          {
            id: 'auth',
            prompt: 'Auth',
            options: [
              {
                value: 'better-auth',
                label: 'Better Auth',
                default: true,
                install: 'pharn-skills-auth/skills/better-auth',
              },
              {
                value: 'clerk',
                label: 'Clerk',
                install: 'pharn-skills-auth/skills/clerk',
              },
              {
                value: 'supabase-auth',
                label: 'Supabase Auth',
                install: 'pharn-skills-auth/skills/supabase-auth',
              },
              { value: 'skip', label: 'skip', install: null },
            ],
            rules: [
              {
                type: 'hide',
                if: { database: { not: 'supabase' } },
                options: ['supabase-auth'],
              },
              {
                type: 'warn',
                if: { auth: 'better-auth', orm: 'skip' },
                message: 'No ORM selected — better-auth expects one.',
              },
            ],
          },
          {
            id: 'email',
            prompt: 'Email',
            options: [
              {
                value: 'resend',
                label: 'Resend',
                default: true,
                install: 'pharn-skills-email/skills/resend',
              },
              { value: 'skip', label: 'skip', install: null },
            ],
            rules: [
              {
                type: 'relabel',
                if: { auth: 'clerk' },
                options: ['resend'],
                label: 'Resend (via Clerk)',
              },
            ],
          },
          {
            id: 'payments',
            prompt: 'Payments',
            options: [
              {
                value: 'stripe',
                label: 'Stripe',
                default: true,
                install: 'pharn-skills-payments/skills/stripe',
              },
              { value: 'skip', label: 'skip', install: null },
            ],
          },
        ],
      },
    ],
    defaults: {
      database: 'supabase',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    },
  };
}

function mod(
  name: string,
  extra: Partial<ManifestModule> = {},
): ManifestModule {
  return {
    name,
    version: '0.1.0',
    required: false,
    dependsOn: [],
    description: name,
    ...extra,
  };
}

export function v2Modules(): ManifestModule[] {
  return [
    mod('pharn-core', { required: true }),
    mod('pharn-pipeline', { dependsOn: ['pharn-core'] }),
    mod('pharn-skills-db', { kind: 'skill-category' }),
    mod('pharn-skills-orm', { kind: 'skill-category' }),
    mod('pharn-skills-auth', { kind: 'skill-category' }),
    mod('pharn-skills-email', { kind: 'skill-category' }),
    mod('pharn-skills-payments', { kind: 'skill-category' }),
  ];
}

// A parsed-shape v2 manifest (already validated upstream by parseManifest).
export function v2Manifest(): Manifest {
  return {
    schemaVersion: 2,
    skillsVersion: '0.69.0',
    modules: v2Modules(),
    wizard: wizardSpec(),
  };
}

// Raw (unparsed) v2 manifest object for exercising parseManifest/parseWizard.
export function rawV2Manifest(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    skillsVersion: '0.69.0',
    modules: v2Modules(),
    wizard: wizardSpec(),
  };
}
