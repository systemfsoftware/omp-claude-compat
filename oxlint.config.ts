import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import { defineConfig } from 'oxlint'

// Standalone strict config. Inlined from the monorepo's private
// `@systemfsoftware/oxlint-config` base + strict presets (never published;
// this repo cannot import them). It carries the portable subset of the
// effective strict rules this code satisfies — every built-in rule below.
// Deliberately absent standalone, with the reason for each:
// - `@systemfsoftware/oxlint-plugin/*` custom rules and their jsPlugin entries:
//   those plugin packages are not in this repo's devDependencies, so the rules
//   cannot load here. `src/` keeps satisfying them by construction (the code is
//   unchanged), but they are unenforceable without the plugins installed.
// - `@systemfsoftware/oxlint-plugin-effect-dmmf` recommended rules and the
//   `tests/**` relaxations that targeted them: vacuous without the plugin.
//   The enforceable `tests/**` relaxations (vitest, unsafe assertion) stay.
// - `@effect/tsgo` correctness preset and the `effecttsgo` plugin entry:
//   `@effect/tsgo` is not in this repo's devDependencies.
export default defineConfig({
  categories: {
    correctness: 'error',
  },

  options: {
    typeAware: true,
  },

  // `import` is deliberately absent. Its only `correctness` rules are
  // `import/default` and `import/namespace`, and `tsc --noEmit` reports both at the
  // same positions (TS1192, TS2339) with `strict` closing the untyped-import gap via
  // TS7016 — so the plugin's module-graph resolution cost bought a duplicate check.
  // A package that wants a rule tsc cannot reach, such as `import/no-cycle`, adds
  // `plugins: ['import']` in its own config.
  // `oxc` MUST be listed explicitly. oxlint turns it on by default, but setting
  // `plugins` REPLACES the default set rather than merging into it, and there is no
  // `--oxc-plugin` flag to reveal the loss -- only `--disable-oxc-plugin`. Omitting it
  // silently dropped every oxc correctness rule (erasing-op, const-comparisons,
  // bad-min-max-func) from the whole tree while `correctness: 'error'` looked enabled.
  plugins: ['typescript', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc'],

  // Delivered consumer-side, not through the aggregate: the plugin walks a Cell description
  // at runtime, so it depends on `effect-cell-types`, and a plugin the aggregate declares
  // would close a build cycle. This package carries three pure phase bodies for it to judge
  // (`internal/run-hooks-for-event.executor.ts`, `internal/run-user-prompt-submit-hooks.executor.ts`).
  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
  ],

  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'typescript/explicit-module-boundary-types': 'off',
    'typescript/no-explicit-any': 'error',
    'jest/no-standalone-expect': 'off',
    'jest/valid-expect': 'off',

    // Constitution I.6 -- exhaustive dispatch over a closed type is the only branch
    // form the pure core admits. `workflow-match-exhaustive` enforces that shape at
    // the `Workflow.make` boundary; this enforces that the match is total.
    'typescript/switch-exhaustiveness-check': 'error',

    // Constitution II.5 -- decode, never cast. The schema plugin's rules close the
    // `as`-adjacent holes; these close the same hole everywhere else, including the
    // `any` leak paths that an `as`-only audit cannot see.
    'typescript/ban-ts-comment': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-type-assertion': 'error',

    // Strict tier: a condition that cannot change the outcome is a dead branch —
    // the mutation gate reports it as a survivor that no test can kill.
    'typescript/no-unnecessary-condition': 'error',

    // `if (hook.async)` on `boolean | undefined` reads the same whether the
    // field is absent or false — the exact shape of the bugs fixed today.
    'typescript/strict-boolean-expressions': 'error',

    ...cellVocabulary.configs.recommended.rules,
  },
  overrides: [
    {
      files: ['tests/**'],
      rules: {
        // A test double for a third-party interface cannot be satisfied
        // structurally -- the host's `ExtensionAPI` declares 40+ `on` overloads
        // and `ExtensionContext` 20+ members. Narrowing one is the point of the
        // double, not a concealed type lie. Test files only; src keeps the rule.
        'typescript/no-unsafe-type-assertion': 'off',
        // The Gherkin step DSL and Effect.runSync-based helpers nest `expect`
        // inside Effect callbacks — vitest plugin cannot statically see these
        // as test blocks. Assertions are real; the rules don't model them.
        'vitest/expect-expect': 'off',
        'vitest/no-standalone-expect': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        // The Gherkin step DSL and Effect.runSync-based helpers nest `expect`
        // inside Effect callbacks — vitest plugin cannot statically see these
        // as test blocks. Assertions are real; the rules don't model them.
        'vitest/expect-expect': 'off',
        'vitest/no-standalone-expect': 'off',
        // A test double for a third-party interface cannot be satisfied
        // structurally -- the host's `ExtensionAPI` declares 40+ `on` overloads
        // and `ExtensionContext` 20+ members. Narrowing one is the point of the
        // double, not a concealed type lie. Test files only; src keeps the rule.
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
    {
      // Fixture projects are input data, not source: a mutation target must carry the
      // shapes these rules forbid, and a runner fixture is plain untyped JS on purpose.
      // Scope correction -- no rule is relaxed for any real source file.
      files: ['**/fixtures/**', '**/__fixtures__/**', '**/testResources/**'],
      rules: {
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
  ],

  ignorePatterns: [
    // Dependencies
    '**/node_modules/**',

    // Build outputs
    '**/dist/**',
    '**/lib/**',
    '**/esm/**',
    '**/cjs/**',
    '**/build/**',
    '**/out/**',
    '**/.tshy/**',
    '**/.tshy-build/**',

    // Monorepo tooling
    '**/.turbo/**',

    // Test & coverage
    '**/coverage/**',
    '**/.stryker-tmp/**',
    '**/__pycache__/**',

    // Generated types
    '**/*.d.ts',
    '**/*.tsbuildinfo',

    // AI assistants
    '**/.claude/**',
    '**/.opencode/**',
    '**/.sisyphus/**',

    // Project-specific
    '**/.repo/**',
    '**/.worktrees/**',
    '**/.issues/**',
    '**/.papi/**',
    '**/submodules/**',
    '**/repos/**',
  ],
})
