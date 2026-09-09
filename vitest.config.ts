import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

// AGENT outranks CI. The agent shell sets both, so a CI-first reading
// gives every agent run the thorough forge treatment - tenfold property draws
// and coverage - for work that wants fast feedback. An agent run is a dev run.
const isAgent = process.env['AGENT'] !== undefined

// Presence, not equality: GitHub Actions writes "true" and the agent shell
// writes "1", so testing against either value classifies the other as local.
const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const sharedTestTimeout = isCI ? 30_000 : isAgent ? 15_000 : 8_000

// Inlined from the monorepo's private `@systemfsoftware/vitest-config` sharedConfig —
// source: systemfsoftware/packages/toolchain/vitest-config (never published; this
// repo cannot import it). Keep in sync with that source:
// node env, globals, includeSource, excludes, coverage. The `include` patterns and
// `resolve.conditions` below are this package's own surface, unchanged.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: isAgent ? 'passed-only' : false,
    ...(isAgent ? { bail: 1 } : {}),
    include: [
      'tests/**/*.test.ts',
      'src/**/*.property.test.ts',
      'src/**/schema-laws.test.ts',
    ],
    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
  plugins: [inlineSchemaTests()],
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
