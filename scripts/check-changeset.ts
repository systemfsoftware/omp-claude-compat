#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-run=git --allow-import --allow-net=jsr.io

import { withoutAll } from '@std/collections/without-all'
import { extract } from '@std/front-matter/yaml'
import { expandGlob } from '@std/fs/expand-glob'
import { basename, dirname } from '@std/path'

const BUMPS = ['none', 'patch', 'minor', 'major'] as const
type Bump = (typeof BUMPS)[number]

const isBump = (value: unknown): value is Bump =>
  typeof value === 'string' && (BUMPS as readonly string[]).includes(value)

const dec = new TextDecoder()

const intentPackages = (markdown: string) => {
  try {
    const { attrs } = extract<Record<string, unknown>>(markdown)
    return Object.entries(attrs).flatMap(([name, bump]) => (isBump(bump) ? [name] : []))
  } catch {
    return []
  }
}

const loadPublicPackages = async () => {
  const pkgs: string[] = []
  for await (const file of expandGlob('packages/*/package.json')) {
    const pkg = JSON.parse(await Deno.readTextFile(file.path)) as {
      name?: string
      version?: string
      private?: boolean
    }
    if (pkg.name && pkg.version && !pkg.private) pkgs.push(pkg.name)
  }
  return pkgs
}

const loadIntentPackages = async () => {
  const named = new Set<string>()
  for await (const file of expandGlob('.changeset/*.md')) {
    if (basename(file.path) === 'README.md') continue
    for (const pkg of intentPackages(await Deno.readTextFile(file.path))) named.add(pkg)
  }
  return named
}

const changedFilesSince = async (baseSha: string) => {
  const out = await new Deno.Command('git', {
    args: ['diff', '--name-only', `${baseSha}...HEAD`],
    stdout: 'piped',
    stderr: 'inherit',
  }).output()
  if (!out.success) throw new Error(`git diff failed (exit ${out.code})`)
  return dec.decode(out.stdout).split('\n').filter(Boolean)
}

const baseSha = Deno.args[0]
if (!baseSha) {
  console.error('usage: ./scripts/check-changeset.ts <base-sha>')
  Deno.exit(2)
}

const changed = await changedFilesSince(baseSha)
const workspaceTouched = changed.some((file) =>
  file === 'packages' || file.startsWith('packages/') || dirname(file) === 'packages'
)
const touched = workspaceTouched ? await loadPublicPackages() : []
const missing = withoutAll(touched, [...await loadIntentPackages()])

if (missing.length === 0) {
  console.log(
    touched.length === 0 ? 'no publishable-package paths in the diff' : `changeset covers: ${touched.join(', ')}`,
  )
} else {
  console.error(
    `::error::publishable package(s) changed with no changeset intent: ${
      missing.join(', ')
    }. Author one with \`pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" ${missing[0]}\`.`,
  )
  Deno.exit(1)
}
