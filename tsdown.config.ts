import { defineConfig } from 'tsdown'

const FORBIDDEN_EXTERNAL = /^(effect|@effect\/)/

interface BudgetChunk {
  readonly type: string
  readonly fileName: string
  readonly isEntry: boolean
  readonly imports: ReadonlyArray<string>
  readonly code: string
}

interface BudgetPluginContext {
  readonly error: (message: string) => never
}

/**
 * Fails the build when an omp plugin entry would cost too much at startup.
 *
 * The host awaits `import(entry)` and runs a scoped Bun `onLoad` hook over every
 * module in the graph, so startup pays for the entry's *static* closure only —
 * dynamic imports are deferred and deliberately not counted. Two ways to blow it:
 * leaving `effect` external (~400 unbundled modules, measured ~30s), or statically
 * reaching a heavy chunk from the entry (e.g. importing a barrel).
 *
 * Inlined from the monorepo's private `@systemfsoftware/tsdown-config/eager-entry-budget`
 * (never published; this repo cannot import it). Keep in sync with that source.
 */
export function eagerEntryBudget({ maxBytes = 32 * 1024 }: { readonly maxBytes?: number } = {}) {
  return {
    name: 'omp-eager-entry-budget',
    generateBundle(
      this: BudgetPluginContext,
      _options: unknown,
      bundle: Record<string, BudgetChunk>,
    ) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
      const entries = chunks.filter((c) => c.isEntry && /(?:^|\/)index\.js$/.test(c.fileName))

      if (entries.length === 0) return

      const externals = new Set<string>()
      for (const chunk of chunks) {
        for (const specifier of chunk.imports) {
          if (!bundle[specifier] && FORBIDDEN_EXTERNAL.test(specifier)) externals.add(specifier)
        }
      }
      if (externals.size > 0) {
        this.error(
          `[omp] externalized ${[...externals].sort().join(', ')} — the host taxes every module in ` +
            `the graph, so these must be bundled via deps.alwaysBundle in tsdown.config.ts`,
        )
      }

      for (const entry of entries) {
        const seen = new Set<string>()
        const walk = (fileName: string): void => {
          if (seen.has(fileName)) return
          const chunk = bundle[fileName]
          if (!chunk || chunk.type !== 'chunk') return
          seen.add(fileName)
          for (const next of chunk.imports) walk(next)
        }
        walk(entry.fileName)

        let bytes = 0
        for (const fileName of seen) {
          const chunk = bundle[fileName]
          if (chunk && chunk.type === 'chunk') bytes += Buffer.byteLength(chunk.code, 'utf8')
        }
        if (bytes > maxBytes) {
          this.error(
            `[omp] ${entry.fileName} statically pulls ${bytes} bytes (budget ${maxBytes}) via ` +
              `${[...seen].join(', ')} — this is paid on every startup; defer it behind a dynamic import`,
          )
        }
      }
    },
  }
}

export default defineConfig({
  entry: { index: './src/index.ts' },

  format: 'esm',
  dts: false,
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  minify: true,
  clean: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    onlyBundle: false,
    alwaysBundle: [
      /^effect$/,
      /^effect\//,
      /^@effect\//,
      /^@systemfsoftware\/effect-cell-types(\/|$)/,
      /^@systemfsoftware\/harness-toml(\/|$)/,
      /^@systemfsoftware\/omp-runtime(\/|$)/,
    ],
  },
  plugins: [eagerEntryBudget()],
  define: { 'import.meta.vitest': 'undefined' },
})
