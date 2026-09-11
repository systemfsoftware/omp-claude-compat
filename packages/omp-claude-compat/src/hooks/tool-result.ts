import type { ToolResultEvent, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { Scope } from 'effect/Scope'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import type { ClaudeSettings } from '../settings/mod.js'
import { type HookRunGate, loadHookSettingsCell } from './hook-settings-cell.js'
import { runToolResultHooks } from './hooks.js'
import type { FeedbackOnlyResult } from './hooks.js'
import { HookOutputFromStdout, type HookResult, type HookSession } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

const ALLOW: HookResult = { code: 0, stdout: '', stderr: '' }

type ToolResultRaw = {
  readonly feedback: FeedbackOnlyResult
  readonly event: ToolResultEvent
}

const hookResultOf = (feedback: FeedbackOnlyResult): HookResult =>
  Option.match(Option.fromNullishOr(feedback.warning), {
    onNone: () => ALLOW,
    onSome: (warning) => ({ code: 1, stdout: '', stderr: warning }),
  })

const interpretToolResultCell = Cell.layer({
  read: (gate: HookRunGate<ToolResultEvent>) =>
    Option.match(Option.fromNullishOr(gate.settings), {
      onNone: () => Effect.succeed({ feedback: {}, event: gate.event } satisfies ToolResultRaw),
      onSome: (settings) =>
        runToolResultHooks(settings, gate.event, gate.ctx).pipe(
          Effect.map((feedback) => ({ feedback, event: gate.event } satisfies ToolResultRaw)),
        ),
    }),
  decode: (raw: ToolResultRaw) => {
    const result = hookResultOf(raw.feedback)
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

const toolResultSandwich = Cell.andThen(
  loadHookSettingsCell<ToolResultEvent>(),
  interpretToolResultCell,
)

export const dispatchToolResult = (input: {
  readonly event: ToolResultEvent
  readonly ctx: HookSession
}): Effect.Effect<
  ToolResultEventResult | undefined,
  PlatformError,
  ClaudeSettings | FileSystem | Scope | ChildProcessSpawner
> => Cell.run(toolResultSandwich, input)
