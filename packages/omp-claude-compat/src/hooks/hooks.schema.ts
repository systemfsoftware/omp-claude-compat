import type { InputEvent } from '@oh-my-pi/pi-coding-agent'
import { Effect, Schema as S, SchemaGetter } from 'effect'

export const ParsedHookOutputSchema = S.Struct({
  decision: S.optional(S.String),
  reason: S.optional(S.String),
  hookSpecificOutput: S.optional(
    S.Struct({
      permissionDecision: S.optional(S.String),
      permissionDecisionReason: S.optional(S.String),
      updatedInput: S.optional(S.Record(S.String, S.Unknown)),
      additionalContext: S.optional(S.String),
    }),
  ),
}).pipe(
  S.annotate({
    toArbitrary: () => (fc) =>
      fc.record({
        decision: fc.string(),
        reason: fc.string(),
        hookSpecificOutput: fc.record({
          permissionDecision: fc.string(),
          permissionDecisionReason: fc.string(),
          updatedInput: fc.dictionary(fc.string(), fc.jsonValue()),
          additionalContext: fc.string(),
        }),
      }),
  }),
)
export type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

export const HookOutputFromStdout = S.String.pipe(
  S.decodeTo(S.toType(ParsedHookOutputSchema), {
    decode: SchemaGetter.transformOrFail((stdout) =>
      S.decodeUnknownEffect(S.fromJsonString(S.toType(ParsedHookOutputSchema)))(stdout).pipe(
        Effect.mapError((err) => {
          if (S.isSchemaError(err)) {
            return err.issue
          } else {
            return err
          }
        }),
      )
    ),
    encode: SchemaGetter.transformOrFail((parsed: ParsedHookOutput) => Effect.succeed(JSON.stringify(parsed))),
  }),
)

export const HookResult = S.Struct({ code: S.Number, stdout: S.String, stderr: S.String })
export type HookResult = S.Schema.Type<typeof HookResult>

export interface HookSession {
  readonly cwd: string
  readonly homeDir: string
  readonly sessionManager: { readonly getSessionId: () => string }
  readonly ui: { readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void }
}

export interface HookToolCall {
  readonly toolName: string
  readonly toolCallId: string

  readonly input: object
}

export interface HookToolResult extends HookToolCall {
  readonly content: unknown
  readonly isError?: boolean | undefined
}

export interface HookPrompt {
  readonly text: string
  readonly source: InputEvent['source']
  readonly images?: InputEvent['images']
}
