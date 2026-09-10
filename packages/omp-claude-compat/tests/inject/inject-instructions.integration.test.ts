import type { BeforeAgentStartEvent } from '@oh-my-pi/pi-coding-agent'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { InjectInstructionsTask } from '@systemfsoftware/omp-claude-compat/inject'
import { ReferencedContent } from '@systemfsoftware/omp-claude-compat/inject'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const fakeEvent: BeforeAgentStartEvent = {
  type: 'before_agent_start',
  prompt: 'test prompt',
  systemPrompt: ['base prompt'],
}

type CapturedHandler = (
  event: BeforeAgentStartEvent,
  ctx: unknown,
) => Promise<{ systemPrompt: readonly string[] } | undefined>

function isExtensionApi(value: unknown): value is Parameters<typeof InjectInstructionsTask>[0] {
  return typeof value === 'object' && value !== null && 'on' in value
}

function captureHandler(
  injectedContent: string,
): { handler: CapturedHandler; fakeLayer: Layer.Layer<ReferencedContent> } {
  const fakeLayer = Layer.succeed(
    ReferencedContent,
    ReferencedContent.of({ load: (_cwd: string) => Effect.succeed(injectedContent) }),
  )
  let captured: CapturedHandler | undefined
  const pi: unknown = {
    on: (event: string, h: CapturedHandler) => {
      if (event === 'before_agent_start') captured = h
    },
  }

  const runSafe = <A, E>(eff: Effect.Effect<A, E, ReferencedContent>) =>
    Effect.runPromise(eff.pipe(Effect.provide(fakeLayer)))

  if (!isExtensionApi(pi)) throw new Error('pi fake must implement on')
  InjectInstructionsTask(pi, runSafe)

  if (captured === undefined) throw new Error('handler not captured')
  return { handler: captured, fakeLayer }
}

Feature('inject handler via ReferencedContent port').body(({ scenario }) => {
  scenario(
    'Handler injects resolved content supplied through port',
    Gherkin.Do.pipe(
      Given('a fake ReferencedContent that returns canned markdown')(
        'ctx',
        () => Effect.succeed(captureHandler('# canned rules\ncontent here')),
      ),
      When('before_agent_start fires')(
        'result',
        (s) => Effect.promise(() => s.ctx.handler(fakeEvent, { cwd: '/test' })),
      ),
      Then('result should append injected markdown to systemPrompt')((s) =>
        Effect.sync(() => {
          expect(s.result?.systemPrompt.join('\n')).toContain('content here')
          expect(s.result?.systemPrompt[0]).toBe('base prompt')
        })
      ),
    ),
  )

  scenario(
    'Handler returns undefined when port yields empty string',
    Gherkin.Do.pipe(
      Given('a fake ReferencedContent that returns empty')('ctx', () => Effect.succeed(captureHandler(''))),
      When('before_agent_start fires')(
        'result',
        (s) => Effect.promise(() => s.ctx.handler(fakeEvent, { cwd: '/test' })),
      ),
      Then('result should be undefined')((s) =>
        Effect.sync(() => {
          expect(s.result).toBeUndefined()
        })
      ),
    ),
  )
})
