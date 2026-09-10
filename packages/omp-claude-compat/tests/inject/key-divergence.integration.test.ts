import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { FileReferencedContentLive } from '@systemfsoftware/omp-claude-compat/inject'
import { ReferencedContent } from '@systemfsoftware/omp-claude-compat/inject'
import { __resetNoInjectRefsForTesting, NoInjectRefsLive } from '@systemfsoftware/omp-claude-compat/no-inject-refs'
import { warmHarnessPolicy } from '@systemfsoftware/omp-claude-compat/runtime'
import { Effect, Layer } from 'effect'
import { afterEach, expect } from 'vitest'

const Feature = makeFeature({ it, layer })

afterEach(() => {
  __resetNoInjectRefsForTesting()
})

Feature('Key divergence — warm and inject key on ctx.cwd, not process.cwd').body(({ scenario }) => {
  scenario(
    'The working directory drives warm-up and injection even when the process cwd differs',
    Gherkin.Do.pipe(
      Given('a ctx cwd distinct from process.cwd with a toml that blocks one ref')('ctx', () =>
        Effect.succeed({
          ctxCwd: '/subagent/project' as const,
          contents: {
            '/subagent/project/systemfsoftware.toml': 'no_inject_refs = ["BLOCKED.md"]',
            '/subagent/project/CLAUDE.md': '@BLOCKED.md\n@ALLOWED.md\n',
            '/subagent/project/BLOCKED.md': 'blocked content',
            '/subagent/project/ALLOWED.md': 'allowed content',
          } as const,
        })),
      When('the ctx cwd is warmed and ReferencedContent.load is called with the same ctx cwd')(
        'result',
        (s) =>
          Effect.gen(function*() {
            const procCwd = process.cwd()
            if (procCwd === s.ctx.ctxCwd) {
              throw new Error('precondition failed: ctx cwd must differ from process.cwd for this test')
            }

            const fsLayer = MemoryFileSystem.layerWith(s.ctx.contents).pipe(Layer.provideMerge(NodePath.layer))
            const live = Layer.mergeAll(NoInjectRefsLive, fsLayer)
            const appLayer = Layer.mergeAll(live, FileReferencedContentLive.pipe(Layer.provide(live)))

            yield* warmHarnessPolicy(s.ctx.ctxCwd).pipe(Effect.provide(appLayer))

            const injected = yield* Effect.flatMap(ReferencedContent, (rc) => rc.load(s.ctx.ctxCwd)).pipe(
              Effect.provide(appLayer),
            )

            return { injected }
          }),
      ),
      Then('the warm for ctx.cwd and the inject load for the same ctx.cwd should agree')((s) =>
        Effect.sync(() => {
          expect(s.result.injected).toContain('allowed content')
          expect(s.result.injected).not.toContain('blocked content')
          expect(s.result.injected).toContain('## ALLOWED.md')
        })
      ),
    ),
  )
})
