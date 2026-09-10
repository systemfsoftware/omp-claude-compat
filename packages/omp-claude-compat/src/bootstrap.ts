import { Cause, Effect, Exit, Layer, ManagedRuntime } from 'effect'

export type RunSafe<R = unknown> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>

export const bootstrapPluginRuntime = <R, LE>(layer: Layer.Layer<R, LE, never>) => {
  const runtime = ManagedRuntime.make(layer)

  const dispose = (): void => {
    void runtime.dispose()
  }
  process.once('SIGINT', dispose)
  process.once('SIGTERM', dispose)

  const runSafe: RunSafe<R> = <A, E>(effect: Effect.Effect<A, E, R>): Promise<A> =>
    runtime.runPromise(Effect.exit(effect)).then((exit) => {
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
      return exit.value
    })

  return { runtime, runSafe } as const
}

export const lazyRunSafe = <R>(
  loadRuntime: () => Promise<{ readonly runSafe: RunSafe<R> }>,
): RunSafe<R> =>
(effect) => loadRuntime().then((mod) => mod.runSafe(effect))

interface WarmContext {
  readonly setTimeout: (handler: () => void, ms: number) => unknown
}

type OnSessionStart = (warm: (ctx: WarmContext) => void) => void

export const warmRuntimeAfterStart = (
  onSessionStart: OnSessionStart,
  loadRuntime: () => Promise<unknown>,
): void => {
  onSessionStart((ctx) => {
    ctx.setTimeout(() => {
      void loadRuntime()
    }, 0)
  })
}
