import type { ToolCallEventResult } from '@oh-my-pi/pi-coding-agent'
import { Effect, Option } from 'effect'
import { ClaudeSettings } from '../settings/mod.js'
import { runPreToolUseHooks } from './hooks.js'
import type { HookSession, HookToolCall } from './hooks.schema.js'

export interface ToolCallInput {
  readonly event: HookToolCall
  readonly ctx: HookSession
}

export const dispatchToolCall = ({ event, ctx }: ToolCallInput) =>
  Effect.gen(function*() {
    const port = yield* ClaudeSettings
    const settings = yield* port.load(ctx.cwd, ctx.homeDir)
    const outcome = yield* Option.match(Option.fromNullishOr(settings), {
      onNone: () => Effect.succeed(undefined),
      onSome: (loaded) => runPreToolUseHooks(loaded, event, ctx),
    })
    if (outcome?.block === true) {
      return { block: true, reason: outcome.reason ?? 'Blocked by PreToolUse hook' } satisfies ToolCallEventResult
    }
    return undefined
  })
