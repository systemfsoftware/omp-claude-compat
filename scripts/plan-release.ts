#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-run=./scripts/tag-released-packages.ts

const CHANGESET_DIR = '.changeset'
const TAG_SCRIPT = './scripts/tag-released-packages.ts'
const dec = new TextDecoder()

const isPendingIntent = (name: string) =>
  name.endsWith('.md') && !name.includes('changelogs/') && name.split('/').pop() !== 'README.md'

const decidePhase = (pendingIntents: number, thisCycle: number) =>
  thisCycle > 0 ? 'publish' : pendingIntents > 0 ? 'version' : 'none'

const countPendingIntents = async () => {
  try {
    let count = 0
    for await (const entry of Deno.readDir(CHANGESET_DIR)) {
      if (entry.isFile && isPendingIntent(entry.name)) count++
    }
    return count
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return 0
    throw error
  }
}

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

const valueOf = (args: string[], flag: string) => {
  const at = args.indexOf(flag)
  if (at === -1) return null
  const value = args[at + 1]
  if (value === undefined || value.startsWith('-')) throw new Error(`missing argument for ${flag}`)
  return value
}

const main = async () => {
  const args = Deno.args
  const outputFile = valueOf(args, '--output')
  const pending = await countPendingIntents()
  const owed = await thisCycleCount()
  const phase = decidePhase(pending, owed)

  console.error(`plan-release: pending_intents=${pending} this_cycle=${owed} -> phase=${phase}`)

  const outputs = [`phase=${phase}`, `pending_intents=${pending}`, `this_cycle=${owed}`].join('\n')
  if (outputFile) await Deno.writeTextFile(outputFile, `${outputs}\n`, { append: true })
  else console.log(outputs)
}

try {
  await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exit(1)
}
