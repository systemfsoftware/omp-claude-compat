#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-run=git --allow-net=api.github.com --allow-env=GH_TOKEN,GITHUB_TOKEN --allow-import

import { parseArgs } from '@std/cli/parse-args'
import { type CycleEntry, loadCaptured, loadWorkspaceCycle } from './lib/cycle.ts'
import { run } from './lib/run.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'assert'],
  string: ['captured'],
})

const cycle: CycleEntry[] = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()

if (cycle.length === 0) {
  console.log('no this-cycle releases — empty captured set')
  Deno.exit(0)
}

const pending: { entry: CycleEntry; body: string }[] = []
for (const entry of cycle) {
  const { name, version, changelog } = entry
  let raw: string | null = null
  try {
    raw = await Deno.readTextFile(changelog)
  } catch {
    raw = null
  }
  if (raw === null || raw.trim().length === 0) {
    const state = raw === null ? 'Missing' : 'Empty'
    console.error(
      `::error::${state} changelog for ${name}@${version}: expected ${changelog} — body must be the pnpm-generated changelog.`,
    )
    Deno.exit(1)
  }
  pending.push({ entry, body: raw.trim() })
}

if (flags.assert) {
  console.log(`assert ok: ${cycle.length} changelog(s) present`)
  Deno.exit(0)
}

if (flags['dry-run']) {
  for (const { entry } of pending) {
    console.log(`would create release ${entry.tag} from ${entry.changelog}`)
  }
  console.log(`dry run: ${pending.length} release(s)`)
  Deno.exit(0)
}

const slug = (await run('git', ['remote', 'get-url', 'origin']))
  .trim()
  .replace(/^git@github\.com:/, 'https://github.com/')
  .replace(/^https?:\/\/github\.com\//, '')
  .replace(/\.git$/, '')
const token = Deno.env.get('GITHUB_TOKEN') ?? Deno.env.get('GH_TOKEN') ?? ''
const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}
if (token) headers.Authorization = `Bearer ${token}`
const api = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(`https://api.github.com/repos/${slug}${path}`, { ...init, headers })

const created: { tag: string; id: number | null }[] = []
let loopError: Error | null = null
for (const { entry, body } of pending) {
  const { tag } = entry
  const existing = await api(`/releases/tags/${encodeURIComponent(tag)}`)
  if (existing.status === 200) {
    console.log(`skip ${tag} — release exists`)
    continue
  }
  if (existing.status !== 404) {
    loopError = new Error(`looking up ${tag} in ${slug} failed with HTTP ${existing.status}`)
    break
  }
  const res = await api('/releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, body, prerelease: false, make_latest: 'false' }),
  })
  if (res.status === 409) {
    console.log(`skip ${tag} — release exists`)
    continue
  }
  if (res.status !== 201 && res.status !== 200) {
    loopError = new Error(`creating release ${tag} failed with HTTP ${res.status}: ${await res.text()}`)
    break
  }
  let id: number | null = null
  try {
    id = (await res.json() as { id?: number }).id ?? null
  } catch {
    id = null
  }
  console.log(`created release ${tag}`)
  created.push({ tag, id })
}

if (created.length > 0) {
  let releaseId = created[0].id
  if (releaseId === null) {
    const getRes = await api(`/releases/tags/${encodeURIComponent(created[0].tag)}`)
    if (getRes.status === 200) {
      try {
        releaseId = (await getRes.json() as { id?: number }).id ?? null
      } catch {
        releaseId = null
      }
    }
  }
  if (releaseId !== null) {
    const patchRes = await api(`/releases/${releaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ make_latest: 'true' }),
    })
    if (patchRes.status !== 200 && patchRes.status !== 201) {
      const msg = `reconciling make_latest for ${created[0].tag} failed with HTTP ${patchRes.status}: ${await patchRes
        .text()}`
      console.error(`::error::${msg}`)
      if (!loopError) loopError = new Error(msg)
    } else {
      console.log(`reconciled make_latest true on ${created[0].tag}`)
    }
  } else if (!loopError) {
    loopError = new Error(`could not resolve release id for ${created[0].tag} to reconcile make_latest`)
  }
}

if (loopError) {
  console.error(`::error::${loopError.message}`)
  Deno.exit(1)
}
console.log(`created ${created.length} release(s), skipped ${cycle.length - created.length}`)
