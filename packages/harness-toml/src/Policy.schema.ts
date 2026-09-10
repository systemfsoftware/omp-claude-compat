// Vendored from the systemfsoftware monorepo — keep in sync with the upstream source.
// Divergence: de-ternary refactors (if/return helpers) — behavior unchanged.

import { parse, stringify } from '@std/toml'
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

const sanitizePolicyKey = (key: string): string => {
  if (key === '__proto__') {
    return `${key}!`
  }
  return key
}

const PolicyKey = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((key) => key !== '__proto__', {
      arbitrary: {
        candidate: {
          make: (fc) => fc.string().map(sanitizePolicyKey),
        },
      },
    }),
  ),
)

export const Policy = Schema.Record(
  PolicyKey,
  Schema.Array(Schema.String),
).pipe(
  Schema.brand('Policy'),
)
export type Policy = Schema.Schema.Type<typeof Policy>

const toTomlParseMessage = (e: unknown): string => {
  if (e instanceof Error) {
    return `TOML parse error: ${e.message}`
  }
  return 'TOML parse error'
}

const TOML_PARSE_ERROR = (e: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({
    message: toTomlParseMessage(e),
  })

export const PolicyFromToml: Schema.Codec<Policy, string> = Schema.String.pipe(
  Schema.decodeTo(Schema.toType(Policy), {
    decode: SchemaGetter.transformOrFail((raw) =>
      Effect.try({
        try: () => parse(raw),
        catch: TOML_PARSE_ERROR,
      }).pipe(
        Effect.flatMap((parsed) => Schema.decodeUnknownEffect(Policy)(parsed)),
        Effect.mapError((err) => {
          if (Schema.isSchemaError(err)) {
            return err.issue
          }
          return err
        }),
      )
    ),
    encode: SchemaGetter.transform((policy: Policy) => stringify(policy)),
  }),
)
