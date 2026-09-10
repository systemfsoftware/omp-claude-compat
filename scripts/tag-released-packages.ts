#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-run=git,pnpm --allow-net=registry.npmjs.org

const dec = new TextDecoder()

type Pkg = {
  name?: string
  version?: string
  private?: boolean
}

type CycleEntry = {
  name: string
  version: string
  tag: string
  changelog: string
}

const changelogPath = (name: string, version: string) => `.changeset/changelogs/${name.replace('/', '!')}@${version}.md`

const computeThisCycle = (pkgs: Pkg[], remoteTags: Set<string>): CycleEntry[] => {
  const out: CycleEntry[] = []
  for (const p of pkgs) {
    if (!p.name || p.private || !p.version) continue
    const tag = `${p.name}@v${p.version}`
    if (remoteTags.has(tag)) continue
    out.push({ name: p.name, version: p.version, tag, changelog: changelogPath(p.name, p.version) })
  }
  return out
}

const normalizeCaptured = (raw: unknown): CycleEntry[] => {
  if (!Array.isArray(raw)) throw new Error('captured file must be a JSON array')
  if (raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((tag) => {
      const atV = tag.lastIndexOf('@v')
      if (atV === -1) throw new Error(`invalid tag in captured list: ${tag}`)
      const name = tag.slice(0, atV)
      const version = tag.slice(atV + 2)
      return { name, version, tag, changelog: changelogPath(name, version) }
    })
  }
  return (raw as Array<Partial<CycleEntry>>).map((e) => {
    const tag = e.tag ?? (e.name && e.version ? `${e.name}@v${e.version}` : null)
    if (!tag) throw new Error(`invalid captured entry: ${JSON.stringify(e)}`)
    const atV = tag.lastIndexOf('@v')
    const name = e.name ?? tag.slice(0, atV)
    const version = e.version ?? tag.slice(atV + 2)
    return { name, version, tag, changelog: e.changelog ?? changelogPath(name, version) }
  })
}

const dropExcluded = (cycle: CycleEntry[], excluded: Set<string>) => cycle.filter((entry) => !excluded.has(entry.name))

const run = async (cmd: string, args: string[]) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  return dec.decode(out.stdout)
}

type Flags = {
  dryRun: boolean
  json: boolean
  unpublished: boolean
  publish: boolean
  outputFile: string | null
  capturedFile: string | null
  excludeFile: string | null
}

const parseArgs = (argv: string[]): Flags => {
  const flags: Flags = {
    dryRun: argv.includes('--dry-run'),
    json: argv.includes('--json'),
    unpublished: argv.includes('--unpublished'),
    publish: argv.includes('--publish'),
    outputFile: null,
    capturedFile: null,
    excludeFile: null,
  }
  const valueOf = (i: number, flag: string) => {
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('-')) throw new Error(`missing argument for ${flag}`)
    return value
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--output') flags.outputFile = valueOf(i, a)
    if (a.startsWith('--output=')) flags.outputFile = a.slice('--output='.length)
    if (a === '--captured' || a === '--captured-file') flags.capturedFile = valueOf(i, a)
    if (a.startsWith('--captured=')) flags.capturedFile = a.slice('--captured='.length)
    if (a.startsWith('--captured-file=')) flags.capturedFile = a.slice('--captured-file='.length)
    if (a === '--exclude') flags.excludeFile = valueOf(i, a)
    if (a.startsWith('--exclude=')) flags.excludeFile = a.slice('--exclude='.length)
  }
  return flags
}

const readExcluded = async (excludeFile: string | null) => {
  if (!excludeFile) return new Set<string>()
  const text = await Deno.readTextFile(excludeFile)
  return new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))
}

const remoteTags = async () =>
  new Set(
    (await run('git', ['ls-remote', '--tags', 'origin']))
      .split('\n')
      .filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
  )

const loadThisCycle = async (flags: Flags) => {
  const excluded = await readExcluded(flags.excludeFile)
  if (flags.capturedFile) {
    return dropExcluded(normalizeCaptured(JSON.parse(await Deno.readTextFile(flags.capturedFile))), excluded)
  }
  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1'])) as Pkg[]
  return dropExcluded(computeThisCycle(pkgs, await remoteTags()), excluded)
}

const registryUrl = (name: string, version: string) =>
  `https://registry.npmjs.org/${name.replace('/', '%2F')}/${version}`

const unpublishedOf = (cycle: CycleEntry[], published: Set<string>) =>
  cycle.filter((entry) => !published.has(`${entry.name}@${entry.version}`))

const fetchPublished = async (cycle: CycleEntry[]) => {
  const hits = await Promise.all(
    cycle.map(async (entry) => {
      const res = await fetch(registryUrl(entry.name, entry.version), { method: 'GET' })
      return res.ok ? `${entry.name}@${entry.version}` : null
    }),
  )
  return new Set(hits.filter((h): h is string => h !== null))
}

const emitCycle = async (cycle: CycleEntry[], flags: Flags) => {
  if (flags.outputFile) {
    await Deno.writeTextFile(flags.outputFile, JSON.stringify(cycle, null, 2))
    console.error(`wrote ${cycle.length} captured package(s) to ${flags.outputFile}`)
  }
  if (flags.json) {
    console.log(JSON.stringify(cycle))
    return
  }
  for (const { tag } of cycle) console.log(`would tag ${tag}`)
  console.log(`dry run: ${cycle.length} tag(s)`)
}

const pushTags = async (cycle: CycleEntry[]) => {
  if (cycle.length === 0) {
    console.log('no new tags to push')
    return
  }
  const made: string[] = []
  for (const { tag } of cycle) {
    await run('git', ['tag', tag])
    made.push(tag)
  }
  await run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
  console.log(`pushed ${made.length} tag(s): ${made.join(', ')}`)
}

const main = async () => {
  const flags = parseArgs(Deno.args)
  let cycle = await loadThisCycle(flags)
  if (flags.unpublished) cycle = unpublishedOf(cycle, await fetchPublished(cycle))
  if (flags.publish) {
    if (cycle.length === 0) {
      console.log('every captured version is already on npm — tagging only')
      return
    }
    await run('pnpm', ['publish', '-r', '--provenance', '--access', 'public', '--no-git-checks'])
    return
  }
  if (flags.dryRun || flags.json || flags.outputFile) {
    await emitCycle(cycle, flags)
    return
  }
  await pushTags(cycle)
}

try {
  await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exit(1)
}
