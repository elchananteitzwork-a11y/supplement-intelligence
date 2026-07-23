// ESLint flat config — added for the V4 Phase 1 frontend reset
// (docs/V4_PRODUCT_ARCHITECTURE.md, docs/RD_V4_PHASE1.md).
//
// This repo had no ESLint configuration before this milestone (no
// eslint/eslint-config-next devDependency, no .eslintrc*). Standing up a
// full project-wide lint config is out of this milestone's scope; the ONE
// thing this file exists to enforce is the V4 namespace import boundary
// below, so the "complete frontend reset" survives future contributors
// without relying on code review alone to catch a stray import.
//
// The V4 namespace (app/app/**, components/partner/**) must never import
// from the legacy component library — it is a complete reset, not a port.
// The single carve-out: components/memo/field-derivations.ts is a
// JSX-free pure-logic module (no 'use client', no JSX) reused verbatim by
// the V4 Brief/Case derivations — components/memo/shared.tsx (a 'use
// client' JSX file that also exports some pure helpers) stays banned even
// though it re-exports field-derivations' functions; see lib/partner-copy.ts's
// header comment for why those specific shared.tsx-only helpers were
// reimplemented instead of imported.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

const LEGACY_UI_IMPORT_BANS = [
  {
    group: ['@/components/pi', '@/components/pi/*'],
    message: 'V4 namespace reset: components/pi is legacy UI, not a design/component reference. See docs/V4_PRODUCT_ARCHITECTURE.md.',
  },
  {
    // Gitignore-style group: the wildcard bans every components/memo/* import,
    // then the trailing negated pattern re-allows the ONE JSX-free pure-logic
    // exception (field-derivations.ts) — ESLint's no-restricted-imports
    // resolves a `group` array like a gitignore file, last match wins.
    group: ['@/components/memo/*', '!@/components/memo/field-derivations'],
    message: 'V4 namespace reset: components/memo (JSX, including \'use client\' shared.tsx) is banned. Only components/memo/field-derivations (a plain, JSX-free .ts module) is reusable pure logic — import from "@/components/memo/field-derivations" directly, never from "@/components/memo/shared" or any other components/memo file. See lib/partner-copy.ts for the pure helpers that live only in shared.tsx and were reimplemented instead of imported.',
  },
  {
    group: ['@/components/shell', '@/components/shell/*'],
    message: 'V4 namespace reset: components/shell is legacy chrome, not a design/component reference.',
  },
  {
    group: ['@/components/ui', '@/components/ui/*'],
    message: 'V4 namespace reset: components/ui is the legacy design system, not a design/component reference.',
  },
  {
    group: ['@/components/cine', '@/components/cine/*'],
    message: 'V4 namespace reset: components/cine (the cinematic redesign) is out of Phase-1 scope for this namespace.',
  },
  {
    group: ['@/components/dashboard', '@/components/dashboard/*'],
    message: 'V4 namespace reset: components/dashboard is legacy UI, not a design/component reference.',
  },
  {
    group: ['@/components/leaderboard', '@/components/leaderboard/*'],
    message: 'V4 namespace reset: components/leaderboard is legacy UI, not a design/component reference.',
  },
  {
    group: ['@/components/research', '@/components/research/*'],
    message: 'V4 namespace reset: components/research is legacy UI, not a design/component reference.',
  },
]

export default tseslint.config(
  {
    ignores: [
      'node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts',
      '.gcloud-sdk/**', 'design-prototypes/**',
    ],
  },
  {
    // Fix-and-resubmit cycle (independent-review finding 5b): the two pure
    // lib/** siblings the V4 namespace's copy logic depends on
    // (lib/partner-copy.ts, lib/positions.ts) previously matched no config
    // block at all — `npx eslint` silently skipped them ("no matching
    // configuration"), so the import ban was never actually enforced there.
    files: ['app/app/**/*.{ts,tsx}', 'components/partner/**/*.{ts,tsx}', 'lib/partner-copy.ts', 'lib/positions.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-imports': ['error', { patterns: LEGACY_UI_IMPORT_BANS }],
    },
  },
  {
    // Fix-and-resubmit cycle (independent-review finding 5a): three
    // components carry `eslint-disable-next-line react-hooks/exhaustive-
    // deps` comments (deliberate — see each file's own header comment for
    // why the effect intentionally runs once on a mount-only trigger), but
    // the plugin was never installed/registered, so `npx eslint` errored on
    // exactly those disable comments ("used but not registered" is the
    // wrong failure — actually the underlying rule didn't exist at all,
    // which ESLint treats as an error at the disable-directive site).
    // Scoped to the same component files (not the plain lib/** modules
    // above, which have no hooks to check).
    files: ['app/app/**/*.{ts,tsx}', 'components/partner/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
