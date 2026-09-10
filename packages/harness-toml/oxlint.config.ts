import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

// The package's own lint surface: the aggregate house preset plus the strict
// TS tier the monorepo layers on top of correctness, and the exemption its
// gherkin-spec suites share with the house base.
export default defineConfig({
  extends: [all],

  rules: {
    'typescript/no-unnecessary-condition': 'error',
    'typescript/strict-boolean-expressions': 'error',
    'typescript/no-non-null-assertion': 'error',
  },

  overrides: [
    {
      // Gherkin step bodies call expect outside test/it — the house base
      // carries the same exemption for its gherkin-spec suites.
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: { 'vitest/no-standalone-expect': 'off' },
    },
    {
      // Node-side tooling reads the build graph; the node:-import ban governs
      // source, and these files are not source.
      files: ['**/vitest.config.ts', '**/tsdown.config.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
})
