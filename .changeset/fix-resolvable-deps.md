---
"@systemfsoftware/omp-claude-compat": patch
---

Remove the unresolvable `@std/toml` runtime dependency. It was declared as `jsr:^1.0.11`
(rewritten to `npm:@jsr/std__toml` on publish) but the build already inlines it via
`deps.alwaysBundle`, so no consumer could install the package without manually mapping the
`@jsr` scope to `https://npm.jsr.io/`. `@std/toml` and `@systemfsoftware/effect-cell-types`
are bundled at build time, so both now live in `devDependencies` only, and the empty
`dependencies` and `optionalDependencies` entries are gone.
