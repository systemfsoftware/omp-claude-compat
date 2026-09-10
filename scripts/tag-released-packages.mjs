#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const changelogPath = (name, version) => `.changeset/changelogs/${name.replace('/', '!')}@${version}.md`

export const computeThisCycle = (pkgs, remoteTags) => {
  const out = []
  for (const p of pkgs) {
    if (!p.name || p.private || !p.version) continue
    const tag = `${p.name}@v${p.version}`
    if (remoteTags.has(tag)) continue
    out.push({ name: p.name, version: p.version, tag, changelog: changelogPath(p.name, p.version) })
  }
  return out
}

export const normalizeCaptured = (raw) => {
  if (!Array.isArray(raw)) throw new Error('captured file must be a JSON array')
  if (raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    return raw.map((tag) => {
      const atV = tag.lastIndexOf('@v')
      if (atV === -1) throw new Error(`invalid tag in captured list: ${tag}`)
      const name = tag.slice(0, atV)
      const version = tag.slice(atV + 2)
      return { name, version, tag, changelog: changelogPath(name, version) }
    })
  }
  return raw.map((e) => {
    const tag = e.tag ?? (e.name && e.version ? `${e.name}@v${e.version}` : null)
    if (!tag) throw new Error(`invalid captured entry: ${JSON.stringify(e)}`)
    const atV = tag.lastIndexOf('@v')
    const name = e.name ?? tag.slice(0, atV)
    const version = e.version ?? tag.slice(atV + 2)
    return { name, version, tag, changelog: e.changelog ?? changelogPath(name, version) }
  })
}

export const dropExcluded = (cycle, excluded) => cycle.filter((entry) => !excluded.has(entry.name))

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' })

const parseArgs = (argv) => {
  const flags = {
    dryRun: argv.includes('--dry-run'),
    json: argv.includes('--json'),
    selftest: argv.includes('--selftest'),
    unpublished: argv.includes('--unpublished'),
    outputFile: null,
    capturedFile: null,
    excludeFile: null,
  }
  const valueOf = (i, flag) => {
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('-')) throw new Error(`missing argument for ${flag}`)
    return value
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
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

const readExcluded = (excludeFile) => {
  if (!excludeFile) return new Set()
  return new Set(
    readFileSync(excludeFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

const remoteTags = () =>
  new Set(
    run('git', ['ls-remote', '--tags', 'origin'])
      .split('\n')
      .filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
  )

const loadThisCycle = (flags) => {
  const excluded = readExcluded(flags.excludeFile)
  if (flags.capturedFile) {
    return dropExcluded(normalizeCaptured(JSON.parse(readFileSync(flags.capturedFile, 'utf8'))), excluded)
  }
  const pkgs = JSON.parse(run('pnpm', ['ls', '-r', '--json', '--depth=-1']))
  return dropExcluded(computeThisCycle(pkgs, remoteTags()), excluded)
}

const registryUrl = (name, version) => `https://registry.npmjs.org/${name.replace('/', '%2F')}/${version}`

export const unpublishedOf = (cycle, published) =>
  cycle.filter((entry) => !published.has(`${entry.name}@${entry.version}`))

const fetchPublished = async (cycle) => {
  const hits = await Promise.all(
    cycle.map(async (entry) => {
      const res = await fetch(registryUrl(entry.name, entry.version), { method: 'GET' })
      return res.ok ? `${entry.name}@${entry.version}` : null
    }),
  )
  return new Set(hits.filter(Boolean))
}

const selftest = () => {
  const failures = []
  const ok = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  ok(changelogPath('@scope/foo', '1.0.0') === '.changeset/changelogs/@scope!foo@1.0.0.md', 'changelog path')
  ok(
    computeThisCycle([{ name: '@scope/a', version: '1.0.0', private: false }], new Set()).length === 1,
    'cycle one absent',
  )
  ok(
    computeThisCycle([{ name: '@scope/a', version: '1.0.0', private: false }], new Set(['@scope/a@v1.0.0'])).length ===
      0,
    'cycle empty when present',
  )
  ok(
    computeThisCycle([{ name: '@scope/priv', version: '1.0.0', private: true }], new Set()).length === 0,
    'private excluded',
  )
  {
    const n = normalizeCaptured(['@scope/x@v1.2.3'])
    ok(n[0].name === '@scope/x' && n[0].version === '1.2.3', 'normalize string')
  }
  {
    const n = normalizeCaptured([{ name: '@scope/y', version: '2.0.0', tag: '@scope/y@v2.0.0' }])
    ok(n[0].changelog === '.changeset/changelogs/@scope!y@2.0.0.md', 'normalize object')
  }
  {
    const cycle = computeThisCycle(
      [
        { name: '@scope/a', version: '1.0.0' },
        { name: '@scope/debut', version: '0.1.0' },
      ],
      new Set(),
    )
    ok(dropExcluded(cycle, new Set()).length === 2, 'no exclusions keeps the cycle')
    const kept = dropExcluded(cycle, new Set(['@scope/debut']))
    ok(kept.length === 1 && kept[0].name === '@scope/a', 'excluded package gets neither tag nor release')
  }
  {
    const cycle = [
      { name: '@scope/a', version: '1.0.0' },
      { name: '@scope/b', version: '2.0.0' },
    ]
    const unpublished = unpublishedOf(cycle, new Set(['@scope/a@1.0.0']))
    ok(unpublished.length === 1 && unpublished[0].name === '@scope/b', 'already-on-npm versions drop out of publish')
  }
  ok(
    registryUrl('@systemfsoftware/omp-claude-compat', '5.0.0') ===
      'https://registry.npmjs.org/@systemfsoftware%2Fomp-claude-compat/5.0.0',
    'scoped registry url',
  )

  if (failures.length > 0) {
    process.stderr.write(`tag-released-packages: selftest FAILED\n${failures.map((f) => `  ${f}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('tag-released-packages: selftest ok (9 fixtures)\n')
}

const emitCycle = (cycle, flags) => {
  if (flags.outputFile) {
    writeFileSync(flags.outputFile, JSON.stringify(cycle, null, 2))
    process.stderr.write(`wrote ${cycle.length} captured package(s) to ${flags.outputFile}\n`)
  }
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(cycle)}\n`)
    return
  }
  for (const { tag } of cycle) process.stdout.write(`would tag ${tag}\n`)
  process.stdout.write(`dry run: ${cycle.length} tag(s)\n`)
}

const pushTags = (cycle) => {
  if (cycle.length === 0) {
    process.stdout.write('no new tags to push\n')
    return
  }
  const made = []
  for (const { tag } of cycle) {
    run('git', ['tag', tag])
    made.push(tag)
  }
  run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
  process.stdout.write(`pushed ${made.length} tag(s): ${made.join(', ')}\n`)
}

const main = async () => {
  const flags = parseArgs(process.argv.slice(2))
  if (flags.selftest) {
    selftest()
    return
  }

  let cycle = loadThisCycle(flags)
  if (flags.unpublished) {
    cycle = unpublishedOf(cycle, await fetchPublished(cycle))
  }

  if (flags.dryRun || flags.json || flags.outputFile) {
    emitCycle(cycle, flags)
    return
  }

  pushTags(cycle)
}

main().catch((error) => {
  process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
