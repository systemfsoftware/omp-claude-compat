import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

// The complete house stack, from the published aggregate: the four custom
// plugins (house, cell vocabulary, effect-dmmf, effect-entrypoint), the stock
// defect and test-hygiene tiers, type awareness, and the correctness category.
// `all` resolves its jsPlugins from its own dependency tree, so this repo does
// not install the plugin packages individually.
export default defineConfig({
  extends: [all],

  rules: {
    // The strict tier the monorepo layers on top of correctness — a condition
    // that cannot change the outcome is a dead branch, `if (x)` on
    // `boolean | undefined` hides absent-vs-false, and `!` asserts away the
    // null the type system is warning about.
    'typescript/no-unnecessary-condition': 'error',
    'typescript/strict-boolean-expressions': 'error',
    'typescript/no-non-null-assertion': 'error',
  },

  overrides: [
    {
      // Gherkin step bodies call expect outside test/it — the house base
      // carries the same exemption for its gherkin-spec suites. An override
      // because the preset's test-hygiene overrides outrank top-level rules.
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: { 'vitest/no-standalone-expect': 'off' },
    },
    {
      // Node-side tooling shells out or reads the build graph, and the host
      // adapter is the one sanctioned node:os seam; the node:-import ban
      // governs source, and none of these files are source.
      files: [
        'commitlint.config.ts',
        '.lintstagedrc.js',
        '**/vitest.config.ts',
        '**/tsdown.config.ts',
        '**/internal/host-env.ts',
      ],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
})
