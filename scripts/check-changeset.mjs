#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export const parseIntentPackages = (markdown) => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return []
  const names = []
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^"([^"]+)":\s*(none|patch|minor|major)\s*$/)
    if (entry) names.push(entry[1])
  }
  return names
}

export const isIntentFile = (name) => name.endsWith('.md') && name !== 'README.md'

export const publicPackagesOf = (manifests) =>
  manifests.filter((p) => p.name && p.version && !p.private).map((p) => ({ name: p.name, dir: p.dir }))

export const touchedPublicPackages = (changedFiles, packages) => {
  const workspaceTouched = changedFiles.some((file) => file === 'packages' || file.startsWith('packages/'))
  if (!workspaceTouched) return []
  return packages.map((pkg) => pkg.name)
}

export const missingIntents = (touched, namedByIntents) => touched.filter((name) => !namedByIntents.has(name))

const loadPublicPackages = (root) => {
  let names
  try {
    names = readdirSync(join(root, 'packages'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const manifests = []
  for (const name of names) {
    const dir = join('packages', name)
    try {
      const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
      manifests.push({ ...pkg, dir })
    } catch (error) {
      if (error && error.code === 'ENOENT') continue
      throw error
    }
  }
  return publicPackagesOf(manifests)
}

const loadIntentPackages = (root) => {
  let files
  try {
    files = readdirSync(join(root, '.changeset'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return new Set()
    throw error
  }
  const named = new Set()
  for (const name of files) {
    if (!isIntentFile(name)) continue
    for (const pkg of parseIntentPackages(readFileSync(join(root, '.changeset', name), 'utf8'))) named.add(pkg)
  }
  return named
}

const changedFilesSince = (baseSha) =>
  execFileSync('git', ['diff', '--name-only', `${baseSha}...HEAD`], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

const selftest = () => {
  const failures = []
  const ok = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  ok(parseIntentPackages('---\n"@scope/a": patch\n---\n\nsummary\n').join() === '@scope/a', 'quoted patch')
  ok(parseIntentPackages('---\n"@scope/a": none\n---\n').includes('@scope/a'), 'none counts')
  ok(parseIntentPackages('# not an intent\n').length === 0, 'README body is not an intent')
  ok(!isIntentFile('README.md'), 'README.md is not an intent file')
  ok(isIntentFile('cyan-wombats-own.md'), 'slug is an intent file')
  ok(
    publicPackagesOf([
      { name: '@scope/pub', version: '1.0.0', private: false, dir: 'packages/pub' },
      { name: '@scope/priv', version: '0.0.0', private: true, dir: 'packages/priv' },
    ]).map((p) => p.name).join() === '@scope/pub',
    'private dropped',
  )
  ok(
    touchedPublicPackages(['packages/pub/src/a.ts', 'scripts/plan-release.mjs'], [
      { name: '@scope/pub', dir: 'packages/pub' },
    ]).join() === '@scope/pub',
    'source touch',
  )
  ok(
    touchedPublicPackages(['packages/priv/src/a.ts'], [{ name: '@scope/pub', dir: 'packages/pub' }]).join() ===
      '@scope/pub',
    'inlined workspace member requires the public package',
  )
  ok(
    touchedPublicPackages(['scripts/plan-release.mjs'], [{ name: '@scope/pub', dir: 'packages/pub' }]).length === 0,
    'root tooling is outside the verdict',
  )
  ok(
    missingIntents(['@scope/pub'], new Set(['@scope/pub'])).length === 0,
    'named package satisfies',
  )
  ok(
    missingIntents(['@scope/pub'], new Set()).join() === '@scope/pub',
    'missing intent fails',
  )

  if (failures.length > 0) {
    process.stderr.write(`check-changeset: selftest FAILED\n${failures.map((f) => `  ${f}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('check-changeset: selftest ok (11 fixtures)\n')
}

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    selftest()
    return
  }

  const baseSha = args[0]
  if (!baseSha) {
    process.stderr.write('usage: node scripts/check-changeset.mjs <base-sha>\n')
    process.exitCode = 2
    return
  }

  const root = process.cwd()
  const touched = touchedPublicPackages(changedFilesSince(baseSha), loadPublicPackages(root))
  const missing = missingIntents(touched, loadIntentPackages(root))
  if (missing.length === 0) {
    process.stdout.write(
      touched.length === 0
        ? 'no publishable-package paths in the diff\n'
        : `changeset covers: ${touched.join(', ')}\n`,
    )
    return
  }

  process.stderr.write(
    `::error::publishable package(s) changed with no changeset intent: ${
      missing.join(', ')
    }. Author one with \`pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" ${missing[0]}\`.\n`,
  )
  process.exitCode = 1
}

try {
  main()
} catch (error) {
  process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
