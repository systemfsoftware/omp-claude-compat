import { join, relative } from 'node:path'

const ROOT = process.cwd()
const DPRINT = join(ROOT, 'bin/dprint')
const ROOT_CONFIG = join(ROOT, 'oxlint.config.ts')

const TOLERATE_A_ZERO_FILE_SET = '--no-error-on-unmatched-pattern'

// The repo has exactly one oxlint config (the root one), so every staged
// source file lints under it. Passing it as `--config` makes it the root
// config, matching what `pnpm lint` applies.
/** @type {import('lint-staged').Configuration} */
export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => [
    `${DPRINT} fmt --allow-no-files -- ${filenames.join(' ')}`,
    `oxlint --fix ${TOLERATE_A_ZERO_FILE_SET} --config ${relative(ROOT, ROOT_CONFIG)} ${
      filenames.join(' ')
    } --type-aware --type-check --quiet`,
  ],
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => [
    `${DPRINT} fmt --allow-no-files -- ${filenames.join(' ')}`,
  ],
}
