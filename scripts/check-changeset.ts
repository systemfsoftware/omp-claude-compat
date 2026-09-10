#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-run=git

const dec = new TextDecoder()

type Manifest = {
  name?: string
  version?: string
  private?: boolean
  dir: string
}

type PublicPkg = { name: string; dir: string }

const parseIntentPackages = (markdown: string) => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return []
  const names: string[] = []
  for (const line of match[1]!.split(/\r?\n/)) {
    const entry = line.match(/^"([^"]+)":\s*(none|patch|minor|major)\s*$/)
    if (entry) names.push(entry[1]!)
  }
  return names
}

const isIntentFile = (name: string) => name.endsWith('.md') && name !== 'README.md'

const publicPackagesOf = (manifests: Manifest[]): PublicPkg[] =>
  manifests.filter((p) => p.name && p.version && !p.private).map((p) => ({ name: p.name!, dir: p.dir }))

const touchedPublicPackages = (changedFiles: string[], packages: PublicPkg[]) => {
  const workspaceTouched = changedFiles.some((file) => file === 'packages' || file.startsWith('packages/'))
  if (!workspaceTouched) return []
  return packages.map((pkg) => pkg.name)
}

const missingIntents = (touched: string[], namedByIntents: Set<string>) =>
  touched.filter((name) => !namedByIntents.has(name))

const loadPublicPackages = async (): Promise<PublicPkg[]> => {
  let names: Deno.DirEntry[]
  try {
    names = []
    for await (const entry of Deno.readDir('packages')) names.push(entry)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return []
    throw error
  }
  const manifests: Manifest[] = []
  for (const entry of names) {
    if (!entry.isDirectory) continue
    const dir = `packages/${entry.name}`
    try {
      const pkg = JSON.parse(await Deno.readTextFile(`${dir}/package.json`)) as Manifest
      manifests.push({ ...pkg, dir })
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue
      throw error
    }
  }
  return publicPackagesOf(manifests)
}

const loadIntentPackages = async () => {
  let files: Deno.DirEntry[]
  try {
    files = []
    for await (const entry of Deno.readDir('.changeset')) files.push(entry)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return new Set<string>()
    throw error
  }
  const named = new Set<string>()
  for (const entry of files) {
    if (!entry.isFile || !isIntentFile(entry.name)) continue
    for (const pkg of parseIntentPackages(await Deno.readTextFile(`.changeset/${entry.name}`))) named.add(pkg)
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

const main = async () => {
  const baseSha = Deno.args[0]
  if (!baseSha) {
    console.error('usage: ./scripts/check-changeset.ts <base-sha>')
    Deno.exit(2)
  }

  const touched = touchedPublicPackages(await changedFilesSince(baseSha), await loadPublicPackages())
  const missing = missingIntents(touched, await loadIntentPackages())
  if (missing.length === 0) {
    console.log(
      touched.length === 0 ? 'no publishable-package paths in the diff' : `changeset covers: ${touched.join(', ')}`,
    )
    return
  }

  console.error(
    `::error::publishable package(s) changed with no changeset intent: ${
      missing.join(', ')
    }. Author one with \`pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" ${missing[0]}\`.`,
  )
  Deno.exit(1)
}

try {
  await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exit(1)
}
