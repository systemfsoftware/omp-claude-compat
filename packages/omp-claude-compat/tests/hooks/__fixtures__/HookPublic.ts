export type { HookDispatchResult } from '@systemfsoftware/omp-claude-compat/hooks'
export { onSessionStart, onToolCall, onToolResult } from '@systemfsoftware/omp-claude-compat/hooks'
export type { HookSession, HookToolCall } from '@systemfsoftware/omp-claude-compat/hooks'
import { ClaudeSettingsLive } from '@systemfsoftware/omp-claude-compat/settings'
import { Effect, Layer, Scope } from 'effect'

export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
