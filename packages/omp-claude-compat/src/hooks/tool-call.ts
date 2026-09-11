import type { ToolCallEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import { ClaudeSettings } from '../settings/mod.js'
import { runPreToolUseHooks } from './hooks.js'
import { HookOutputFromStdout, type HookResult, type HookSession, type HookToolCall } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

export interface ToolCallInput {
  readonly event: HookToolCall
  readonly ctx: HookSession
}

type PreToolUseRaw = { readonly block?: boolean; readonly reason?: string } | undefined

const absentRaw: PreToolUseRaw = undefined

const decodeHookResult = (raw: PreToolUseRaw): HookResult =>
  Option.match(Option.fromNullishOr(raw), {
    onNone: () => ({ code: 0, stdout: '', stderr: '' }),
    onSome: (result) =>
      Match.value(result.block).pipe(
        Match.when(true, () => ({ code: 2, stdout: '', stderr: result.reason ?? '' })),
        Match.orElse(() => ({ code: 0, stdout: '', stderr: '' })),
      ),
  })

export const toolCallCell = Cell.layer({
  read: ({ event, ctx }: ToolCallInput) =>
    Effect.gen(function*() {
      const port = yield* ClaudeSettings
      const settings = yield* port.load(ctx.cwd, ctx.homeDir)
      return yield* Option.match(Option.fromNullishOr(settings), {
        onNone: () => Effect.succeed(absentRaw),
        onSome: (loaded) => runPreToolUseHooks(loaded, event, ctx),
      })
    }),
  decode: (raw: PreToolUseRaw) => {
    const result = decodeHookResult(raw)
    return Result.succeed(
      new InterpretHookCommand({
        result,
        event: 'PreToolUse',
        parsed: Exit.match(S.decodeUnknownExit(HookOutputFromStdout)(result.stdout), {
          onFailure: () => Option.none(),
          onSuccess: Option.some,
        }),
      }),
    )
  },
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
