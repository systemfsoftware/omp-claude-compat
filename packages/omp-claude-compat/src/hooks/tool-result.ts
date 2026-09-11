import type { ToolResultEvent, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Effect, Option } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import { ClaudeSettings } from '../settings/mod.js'
import { runToolResultHooks } from './hooks.js'
import type { HookDispatchContext } from './hooks.js'
import type { HookSession } from './hooks.schema.js'

export interface ToolResultInput {
  readonly event: ToolResultEvent
  readonly ctx: HookSession
}

export const dispatchToolResult = ({
  event,
  ctx,
}: ToolResultInput): Effect.Effect<ToolResultEventResult | undefined, PlatformError, HookDispatchContext> =>
  Effect.gen(function*() {
    const port = yield* ClaudeSettings
    const settings = yield* port.load(ctx.cwd, ctx.homeDir)
    const feedback = yield* Option.match(Option.fromNullishOr(settings), {
      onNone: () => Effect.succeed(undefined),
      onSome: (loaded) => runToolResultHooks(loaded, event, ctx),
    })
    const text = feedback?.warning
    if (text === undefined) {
      return undefined
    }
    return {
      content: [...event.content, { type: 'text' as const, text }],
      isError: event.isError,
    } satisfies ToolResultEventResult
  })
