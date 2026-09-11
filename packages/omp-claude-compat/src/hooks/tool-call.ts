import type { ToolCallEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import { type HookRunGate, loadHookSettingsCell } from './hook-settings-cell.js'
import { runPreToolUseHooks } from './hooks.js'
import { HookOutputFromStdout, type HookResult, type HookToolCall } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

const ALLOW: HookResult = { code: 0, stdout: '', stderr: '' }

type PreToolUseRaw = { readonly block?: boolean; readonly reason?: string } | undefined

const hookResultOf = (raw: PreToolUseRaw): HookResult =>
  Option.match(Option.fromNullishOr(raw), {
    onNone: () => ALLOW,
    onSome: (result) =>
      Match.value(result.block).pipe(
        Match.when(true, () => ({ code: 2, stdout: '', stderr: result.reason ?? '' } satisfies HookResult)),
        Match.orElse(() => ALLOW),
      ),
  })

const emptyRaw: PreToolUseRaw = undefined

const runPreToolUseCell = Cell.layer({
  read: (gate: HookRunGate<HookToolCall>) =>
    Option.match(Option.fromNullishOr(gate.settings), {
      onNone: () => Effect.succeed(emptyRaw),
      onSome: (settings) => runPreToolUseHooks(settings, gate.event, gate.ctx),
    }),
  decode: (raw: PreToolUseRaw) => {
    const result = hookResultOf(raw)
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

export const toolCallCell = Cell.andThen(loadHookSettingsCell<HookToolCall>(), runPreToolUseCell)
