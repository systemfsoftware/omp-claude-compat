import type { ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, Result, Schema as S } from 'effect'
import { ClaudeSettings } from '../settings/mod.js'
import { runToolResultHooks } from './hooks.js'
import { HookOutputFromStdout, type HookResult } from './hooks.schema.js'
import type { HookSession } from './hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from './interpret-hook-result.workflow.js'

export interface ToolResultInput {
  readonly event: ToolResultEvent
  readonly ctx: HookSession
}

const ALLOW: HookResult = { code: 0, stdout: '', stderr: '' }

export const toolResultCell = Cell.layer({
  read: ({ event, ctx }: ToolResultInput) =>
    Effect.gen(function*() {
      const port = yield* ClaudeSettings
      const settings = yield* port.load(ctx.cwd, ctx.homeDir)
      if (settings === null) {
        return ALLOW
      }
      const feedback = yield* runToolResultHooks(settings, event, ctx)
      if (feedback.warning === undefined) {
        return ALLOW
      }
      return { code: 1, stdout: '', stderr: feedback.warning } satisfies HookResult
    }),
  decode: (raw: HookResult) =>
    Result.succeed(
      new InterpretHookCommand({
        result: raw,
        event: 'PostToolUse',
        parsed: Exit.match(S.decodeUnknownExit(HookOutputFromStdout)(raw.stdout), {
          onFailure: () => Option.none(),
          onSuccess: Option.some,
        }),
      }),
    ),
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
  write: (output) => Effect.succeed(Option.getOrUndefined(output)),
})
