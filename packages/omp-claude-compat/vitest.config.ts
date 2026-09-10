import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

// AGENT outranks CI. The agent shell sets both, so a CI-first reading
// gives every agent run the thorough forge treatment - tenfold property draws
// and coverage - for work that wants fast feedback. An agent run is a dev run.
const isAgent = process.env['AGENT'] !== undefined

// Presence, not equality: GitHub Actions writes "true" and the agent shell
// writes "1", so testing against either value classifies the other as local.
const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const resolveSharedTestTimeout = (ci: boolean, agent: boolean): number => {
  if (ci) {
    return 30_000
  }
  if (agent) {
    return 15_000
  }
  return 8_000
}

const sharedTestTimeout = resolveSharedTestTimeout(isCI, isAgent)

const resolveSilent = (agent: boolean): 'passed-only' | false => {
  if (agent) {
    return 'passed-only'
  }
  return false
}

const resolveAgentBail = (agent: boolean): { readonly bail?: number } => {
  if (agent) {
    return { bail: 1 }
  }
  return {}
}

// Inlined from the monorepo's private `@systemfsoftware/vitest-config` sharedConfig —
// source: systemfsoftware/packages/toolchain/vitest-config (never published; this
// repo cannot import it). Keep in sync with that source:
// node env, globals, includeSource, excludes, coverage. The `include` patterns,
// `pool`, and `resolve.alias` below are this package's own surface.
const srcUrl = (module: string): string => new URL(`./src/${module}`, import.meta.url).pathname

// The build bundles the whole effect runtime into dist (deps.alwaysBundle — the
// host taxes every module in the plugin graph), so executing the built graph
// inside vitest would run a second effect runtime beside the runner's own and
// corrupt fiber state (crash: `parentRuntime._children.delete` on undefined).
// Vitest also ignores resolve.conditions for package self-references, so bind
// each public subpath to its source module: the integration suites still import
// the package by name, but exercise the src graph the runner's effect belongs to.
const publicSubpaths: ReadonlyArray<[string, string]> = [
  ['@systemfsoftware/omp-claude-compat', 'index.ts'],
  ['@systemfsoftware/omp-claude-compat/policy', 'policy/mod.ts'],
  ['@systemfsoftware/omp-claude-compat/hooks', 'hooks/mod.ts'],
  ['@systemfsoftware/omp-claude-compat/settings', 'settings/mod.ts'],
  ['@systemfsoftware/omp-claude-compat/inject', 'inject/mod.ts'],
  ['@systemfsoftware/omp-claude-compat/no-inject-refs', 'inject/no-inject-refs.ts'],
  ['@systemfsoftware/omp-claude-compat/runtime', 'runtime.ts'],
]

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    environment: 'node',
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: resolveSilent(isAgent),
    ...resolveAgentBail(isAgent),
    include: [
      'tests/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'src/**/schema-laws.test.ts',
    ],
    pool: 'forks',
    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
  plugins: [inlineSchemaTests()],
  resolve: {
    conditions: ['@systemfsoftware/source'],
    alias: publicSubpaths.map(([find, module]) => ({
      find: new RegExp(`^${find.replace('/', '\\/')}$`),
      replacement: srcUrl(module),
    })),
  },
})
