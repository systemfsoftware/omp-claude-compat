#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-run=./scripts/tag-released-packages.ts --allow-import --allow-net=jsr.io

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { basename } from '@std/path'

const CHANGESET_DIR = '.changeset'
const TAG_SCRIPT = './scripts/tag-released-packages.ts'
const dec = new TextDecoder()

const thisCycleCount = async () => {
  const out = await new Deno.Command(TAG_SCRIPT, {
    args: ['--dry-run', '--json'],
    stdout: 'piped',
    stderr: 'inherit',
  }).output()
  if (!out.success) throw new Error(`${TAG_SCRIPT} failed (exit ${out.code})`)
  const parsed = JSON.parse(dec.decode(out.stdout))
  if (!Array.isArray(parsed)) throw new Error(`${TAG_SCRIPT} must print a JSON array`)
  return parsed.length
}

let pending = 0
for await (const entry of expandGlob('*.md', { root: CHANGESET_DIR })) {
  const name = basename(entry.path)
  if (name !== 'README.md') pending++
}

const flags = parseArgs(Deno.args, { string: ['output'] })
const owed = await thisCycleCount()
const phase = owed > 0 ? 'publish' : pending > 0 ? 'version' : 'none'

console.error(`plan-release: pending_intents=${pending} this_cycle=${owed} -> phase=${phase}`)

const outputs = [`phase=${phase}`, `pending_intents=${pending}`, `this_cycle=${owed}`].join('\n')
if (flags.output) await Deno.writeTextFile(flags.output, `${outputs}\n`, { append: true })
else console.log(outputs)
