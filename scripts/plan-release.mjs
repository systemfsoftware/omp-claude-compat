#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { appendFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CHANGESET_DIR = '.changeset'
const TAG_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'tag-released-packages.mjs')

export const isPendingIntent = (name) =>
  name.endsWith('.md') && !name.includes('changelogs/') && name.split('/').pop() !== 'README.md'

export const decidePhase = (pendingIntents, thisCycle) =>
  thisCycle > 0 ? 'publish' : pendingIntents > 0 ? 'version' : 'none'

const countPendingIntents = () => {
  try {
    return readdirSync(CHANGESET_DIR).filter((name) => isPendingIntent(name)).length
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0
    throw error
  }
}

const thisCycleCount = () => {
  const out = execFileSync(process.execPath, [TAG_SCRIPT, '--dry-run', '--json'], { encoding: 'utf8' })
  const parsed = JSON.parse(out)
  if (!Array.isArray(parsed)) throw new Error(`${TAG_SCRIPT} must print a JSON array`)
  return parsed.length
}

const selftest = () => {
  const phases = [
    ['owed tags win over pending intents', decidePhase(3, 5), 'publish'],
    ['owed tags with no intents is publish', decidePhase(0, 5), 'publish'],
    ['pending intents with nothing owed is version', decidePhase(3, 0), 'version'],
    ['nothing pending and nothing owed is none', decidePhase(0, 0), 'none'],
  ]
  const intents = [
    ['a slug intent is pending', isPendingIntent('cyan-wombats-own.md'), true],
    ['README.md is not an intent', isPendingIntent('README.md'), false],
    ['a path to README.md is not an intent', isPendingIntent('.changeset/README.md'), false],
    ['ledger.yaml is not an intent', isPendingIntent('ledger.yaml'), false],
    ['an authored changelog is not an intent', isPendingIntent('changelogs/@systemfsoftware!all@1.0.0.md'), false],
    ['the changelogs directory is not an intent', isPendingIntent('changelogs'), false],
  ]

  const failures = [...phases, ...intents].filter(([, actual, expected]) => actual !== expected)
  for (const [name, actual, expected] of failures) {
    process.stderr.write(`selftest: ${name} — expected ${expected}, got ${actual}\n`)
  }
  if (failures.length > 0) {
    process.stderr.write(`selftest FAILED: ${failures.length} of ${phases.length + intents.length}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`selftest ok: ${phases.length + intents.length} cases\n`)
}

const valueOf = (args, flag) => {
  const at = args.indexOf(flag)
  if (at === -1) return null
  const value = args[at + 1]
  if (value === undefined || value.startsWith('-')) throw new Error(`missing argument for ${flag}`)
  return value
}

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    selftest()
    return
  }

  const outputFile = valueOf(args, '--output')
  const pending = countPendingIntents()
  const owed = thisCycleCount()
  const phase = decidePhase(pending, owed)

  process.stderr.write(`plan-release: pending_intents=${pending} this_cycle=${owed} -> phase=${phase}\n`)

  const outputs = [`phase=${phase}`, `pending_intents=${pending}`, `this_cycle=${owed}`].join('\n')
  if (outputFile) appendFileSync(outputFile, `${outputs}\n`)
  else process.stdout.write(`${outputs}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
