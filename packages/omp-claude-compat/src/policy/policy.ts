import { Effect, Exit, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { Policy, PolicyFromToml } from './policy.schema.js'

const emptyPolicyExit = Schema.decodeExit(Policy)({})
const EMPTY_POLICY: Policy = Exit.match(emptyPolicyExit, {
  onFailure: () => {
    throw new Error('the empty record always satisfies the Policy schema')
  },
  onSuccess: (policy) => policy,
})

const USER_POLICY_DIR = '.config/systemfsoftware'
const PROJECT_POLICY_FILE = 'systemfsoftware.toml'
const LOCAL_POLICY_FILE = 'systemfsoftware.local.toml'

export const homeAnchor = (
  env: Record<string, string | undefined>,
  osHomedir: string,
): string => {
  const override = env['HARNESS_POLICY_HOME']
  if (typeof override === 'string' && override.length > 0) return override
  return osHomedir
}

export const policyFilePaths = (homeDir: string, cwd: string): readonly string[] => [
  `${homeDir}/${USER_POLICY_DIR}/${PROJECT_POLICY_FILE}`,
  `${cwd}/${PROJECT_POLICY_FILE}`,
  `${cwd}/${LOCAL_POLICY_FILE}`,
]

const mergeLayers = <V>(
  layers: readonly Readonly<Record<string, readonly V[]>>[],
): Record<string, readonly V[]> =>
  layers.reduce<Record<string, readonly V[]>>((merged, layer) => ({ ...merged, ...layer }), {})

export const readLayer = (
  filePath: string,
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFileString(filePath).pipe(
      Effect.flatMap(Schema.decodeEffect(PolicyFromToml)),
      Effect.orElseSucceed(() => EMPTY_POLICY),
    ))

export const readLayers = (
  filePaths: readonly string[],
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.all(filePaths.map(readLayer), { concurrency: 'unbounded' }).pipe(
    Effect.map(mergeLayers),
    Effect.flatMap(Schema.decodeEffect(Policy)),
    Effect.orDie,
  )
