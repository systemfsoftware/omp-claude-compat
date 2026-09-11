import type { ToolCallEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import { ClaudeSettings } from '../settings/mod.js'
import { runPreToolUseHooks } from './hooks.js'
import { HookOutputFromStdout, type HookResult } from './hooks.schema.js'
import type { HookSession, HookToolCall } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

export interface ToolCallInput {
  readonly event: HookToolCall
  readonly ctx: HookSession
}

const ALLOW: HookResult = { code: 0, stdout: '', stderr: '' }

export const toolCallCell = Cell.layer({
  read: ({ event, ctx }: ToolCallInput) =>
    Effect.gen(function*() {
      const port = yield* ClaudeSettings
      const settings = yield* port.load(ctx.cwd, ctx.homeDir)
      if (settings === null) {
        return ALLOW
      }
      const result = yield* runPreToolUseHooks(settings, event, ctx)
      if (result !== undefined && result.block === true) {
        if (result.reason === undefined) {
          return { code: 2, stdout: '', stderr: '' } satisfies HookResult
        }
        return { code: 2, stdout: '', stderr: result.reason } satisfies HookResult
      }
      return ALLOW
    }),
  decode: (raw: HookResult) =>
    Result.succeed(
      new InterpretHookCommand({
        result: raw,
        event: 'PreToolUse',
        parsed: Exit.match(S.decodeUnknownExit(HookOutputFromStdout)(raw.stdout), {
          onFailure: () => Option.none(),
          onSuccess: Option.some,
        }),
      }),
    ),
  decide: interpretHookResult,
  encode: (outcome) =>
    Result.match(outcome, {
      onFailure: () => Option.none<ToolCallEventResult>(),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('Allow', () => Option.none<ToolCallEventResult>()),
          Match.tag('Warning', () => Option.none<ToolCallEventResult>()),
          Match.tag(
            'Block',
            (blocked) => Option.some({ block: true, reason: blocked.reason } satisfies ToolCallEventResult),
          ),
          Match.exhaustive,
        ),
    }),
  write: (output) => Effect.succeed(Option.getOrUndefined(output)),
})
