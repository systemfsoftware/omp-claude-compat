import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

export class AdmitHooksCommand extends S.TaggedClass<AdmitHooksCommand>()('AdmitHooksCommand', {
  present: S.Boolean,
}) {}

export type AdmitCommand = InstanceType<typeof AdmitHooksCommand>

const HookDispatchDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/HookDispatchDecision',
)
type HookDispatchDecisionTypeId = typeof HookDispatchDecisionTypeId

export class SkipHooks extends S.TaggedClass<SkipHooks>()('SkipHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export class RunHooks extends S.TaggedClass<RunHooks>()('RunHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export type HookDispatchDecision = InstanceType<typeof SkipHooks> | InstanceType<typeof RunHooks>

export class CannotAdmitHooks extends S.TaggedError<CannotAdmitHooks>()('CannotAdmitHooks', {
  reason: S.String,
}) {}

export const admitLoadedSettings = Workflow.make(
  AdmitHooksCommand,
  (command: AdmitCommand): Result.Result<HookDispatchDecision, CannotAdmitHooks> =>
    Result.succeed(
      Match.value(command.present).pipe(
        Match.when(true, () => new RunHooks()),
        Match.when(false, () => new SkipHooks()),
        Match.exhaustive,
      ),
    ),
)
