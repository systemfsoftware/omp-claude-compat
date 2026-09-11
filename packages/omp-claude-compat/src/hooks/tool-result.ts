import type { ToolResultEvent, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { Scope } from 'effect/Scope'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { ClaudeSettings } from '../settings/mod.js'
import { runToolResultHooks } from './hooks.js'
import type { FeedbackOnlyResult } from './hooks.js'
import { HookOutputFromStdout, type HookResult, type HookSession } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

type ToolResultRaw = {
  readonly feedback: FeedbackOnlyResult
  readonly event: ToolResultEvent
}

const decodeHookResult = (feedback: FeedbackOnlyResult): HookResult =>
  Option.match(Option.fromNullishOr(feedback.warning), {
    onNone: () => ({ code: 0, stdout: '', stderr: '' }),
    onSome: (warning) => ({ code: 1, stdout: '', stderr: warning }),
  })

const interpretToolResultCell = Cell.layer({
  read: (input: { readonly event: ToolResultEvent; readonly ctx: HookSession }) =>
    Effect.gen(function*() {
      const port = yield* ClaudeSettings
      const settings = yield* port.load(input.ctx.cwd, input.ctx.homeDir)
      const feedback = yield* Option.match(Option.fromNullishOr(settings), {
        onNone: () => Effect.succeed({} satisfies FeedbackOnlyResult),
        onSome: (loaded) => runToolResultHooks(loaded, input.event, input.ctx),
      })
      return { feedback, event: input.event } satisfies ToolResultRaw
    }),
  decode: (raw: ToolResultRaw) => {
    const result = decodeHookResult(raw.feedback)
    return Result.succeed(
      new InterpretHookCommand({
        result,
        event: 'PostToolUse',
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
      onFailure: () => Option.none<string>(),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('Allow', () => Option.none<string>()),
          Match.tag('Warning', (warning) => Option.some(warning.message)),
          Match.tag('Block', (blocked) => Option.some(blocked.reason)),
          Match.exhaustive,
        ),
    }),
  write: (extra, raw: ToolResultRaw) =>
    Effect.succeed(
      Option.match(extra, {
        onNone: () => undefined,
        onSome: (text) =>
          ({
            content: [...raw.event.content, { type: 'text' as const, text }],
            isError: raw.event.isError,
          }) satisfies ToolResultEventResult,
      }),
    ),
})

export const dispatchToolResult = (input: {
  readonly event: ToolResultEvent
  readonly ctx: HookSession
}): Effect.Effect<
  ToolResultEventResult | undefined,
  PlatformError,
  ClaudeSettings | FileSystem | Scope | ChildProcessSpawner
> => Cell.run(interpretToolResultCell, input)
