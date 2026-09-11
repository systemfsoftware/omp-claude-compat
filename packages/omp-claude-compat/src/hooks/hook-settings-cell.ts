import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, Result } from 'effect'
import { ClaudeSettings } from '../settings/mod.js'
import type { HookSettings } from '../settings/mod.js'
import { admitLoadedSettings } from './admit-loaded-settings.workflow.js'
import { admitPresent } from './admit-present.js'
import type { HookSession } from './hooks.schema.js'

export interface HookSettingsInput<Event> {
  readonly event: Event
  readonly ctx: HookSession
}

export type HookRunGate<Event> = {
  readonly settings: HookSettings | null
  readonly event: Event
  readonly ctx: HookSession
}

type LoadRaw<Event> = {
  readonly input: HookSettingsInput<Event>
  readonly settings: HookSettings | null
}

export const loadHookSettingsCell = <Event>() =>
  Cell.layer({
    read: (input: HookSettingsInput<Event>) =>
      Effect.gen(function*() {
        const port = yield* ClaudeSettings
        const settings = yield* port.load(input.ctx.cwd, input.ctx.homeDir)
        return { input, settings } satisfies LoadRaw<Event>
      }),
    decode: (raw: LoadRaw<Event>) => Result.succeed(admitPresent(Option.isSome(Option.fromNullishOr(raw.settings)))),
    decide: admitLoadedSettings,
    encode: (outcome) => outcome,
    write: (output, raw: LoadRaw<Event>): Effect.Effect<HookRunGate<Event>> =>
      Result.match(output, {
        onFailure: () =>
          Effect.succeed({
            settings: null,
            event: raw.input.event,
            ctx: raw.input.ctx,
          }),
        onSuccess: (decision) =>
          Match.value(decision).pipe(
            Match.tag('SkipHooks', () =>
              Effect.succeed({
                settings: null,
                event: raw.input.event,
                ctx: raw.input.ctx,
              })),
            Match.tag('RunHooks', () =>
              Effect.succeed({
                settings: raw.settings,
                event: raw.input.event,
                ctx: raw.input.ctx,
              })),
            Match.exhaustive,
          ),
      }),
  })
