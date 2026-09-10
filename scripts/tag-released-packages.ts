#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-run=git,pnpm --allow-net=jsr.io,registry.npmjs.org --allow-import

import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'

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

const changelogPath = (name: string, version: string) =>
  join('.changeset', 'changelogs', `${name.replace('/', '!')}@${version}.md`)

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

const run = async (cmd: string, args: string[]) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  return dec.decode(out.stdout)
}

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'json', 'unpublished', 'publish'],
  string: ['output', 'captured', 'exclude'],
  alias: { 'captured-file': 'captured' },
})

const excluded = new Set<string>(
  flags.exclude
    ? (await Deno.readTextFile(flags.exclude)).split('\n').map((line) => line.trim()).filter(Boolean)
    : [],
)

const remoteTags = new Set(
  (await run('git', ['ls-remote', '--tags', 'origin']))
    .split('\n')
    .filter(Boolean)
    .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
)

let cycle = flags.captured
  ? normalizeCaptured(JSON.parse(await Deno.readTextFile(flags.captured))).filter((entry) => !excluded.has(entry.name))
  : computeThisCycle(
    JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1'])) as Pkg[],
    remoteTags,
  ).filter((entry) => !excluded.has(entry.name))

if (flags.unpublished) {
  const published = new Set(
    (
      await Promise.all(
        cycle.map(async (entry) => {
          const url = `https://registry.npmjs.org/${entry.name.replace('/', '%2F')}/${entry.version}`
          const res = await fetch(url, { method: 'GET' })
          return res.ok ? `${entry.name}@${entry.version}` : null
        }),
      )
    ).filter((h): h is string => h !== null),
  )
  cycle = cycle.filter((entry) => !published.has(`${entry.name}@${entry.version}`))
}

if (flags.publish) {
  if (cycle.length === 0) {
    console.log('every captured version is already on npm — tagging only')
  } else {
    await run('pnpm', ['publish', '-r', '--provenance', '--access', 'public', '--no-git-checks'])
  }
} else if (flags['dry-run'] || flags.json || flags.output) {
  if (flags.output) {
    await Deno.writeTextFile(flags.output, JSON.stringify(cycle, null, 2))
    console.error(`wrote ${cycle.length} captured package(s) to ${flags.output}`)
  }
  if (flags.json) console.log(JSON.stringify(cycle))
  else {
    for (const { tag } of cycle) console.log(`would tag ${tag}`)
    console.log(`dry run: ${cycle.length} tag(s)`)
  }
} else if (cycle.length === 0) {
  console.log('no new tags to push')
} else {
  const made: string[] = []
  for (const { tag } of cycle) {
    await run('git', ['tag', tag])
    made.push(tag)
  }
  await run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
  console.log(`pushed ${made.length} tag(s): ${made.join(', ')}`)
}
