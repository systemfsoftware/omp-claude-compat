import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'

export default async function claudeCompatExtension(pi: ExtensionAPI): Promise<void> {
  const { lazyRunSafe, warmRuntimeAfterStart } = await import('./bootstrap.js')
  const runSafe = lazyRunSafe(() => import('./runtime.js'))
  const [
    { HookDispatcherTask },
    { InjectInstructionsTask },
    { toolCallCell },
    { toolResultCell },
    { Cell },
    { Effect, Option, Result },
    { homeDir },
  ] = await Promise.all([
    import('./hooks/mod.js'),
    import('./inject/mod.js'),
    import('./hooks/tool-call.js'),
    import('./hooks/tool-result.js'),
    import('@systemfsoftware/effect-cell-types'),
    import('effect'),
    import('./internal/host-env.js'),
  ])
  HookDispatcherTask(pi, runSafe)
  const handlerCeilingMs = 28_000
  pi.on('tool_call', (event, ctx) => {
    const timed = Effect.gen(function*() {
      const outcome = yield* Effect.result(
        Cell.run(toolCallCell, {
          event,
          ctx: {
            cwd: ctx.cwd,
            homeDir: homeDir(),
            sessionManager: ctx.sessionManager,
            ui: ctx.ui,
          },
        }),
      )
      if (Result.isFailure(outcome)) {
        throw new Error('hook dispatch effect failed', { cause: outcome.failure })
      }
      return outcome.success
    }).pipe(Effect.timeoutOption(handlerCeilingMs))
    return runSafe(timed).then((result) => Option.getOrUndefined(result))
  })
  pi.on('tool_result', (event, ctx) => {
    const timed = Effect.gen(function*() {
      const outcome = yield* Effect.result(
        Cell.run(toolResultCell, {
          event,
          ctx: {
            cwd: ctx.cwd,
            homeDir: homeDir(),
            sessionManager: ctx.sessionManager,
            ui: ctx.ui,
          },
        }),
      )
      if (Result.isFailure(outcome)) {
        throw new Error('hook dispatch effect failed', { cause: outcome.failure })
      }
      const extra = outcome.success
      if (extra === undefined) {
        return undefined
      }
      return {
        content: [...event.content, { type: 'text' as const, text: extra }],
        isError: event.isError,
      }
    }).pipe(Effect.timeoutOption(handlerCeilingMs))
    return runSafe(timed).then((result) => Option.getOrUndefined(result))
  })
  InjectInstructionsTask(pi, runSafe)
  pi.on('session_start', async (_e, ctx) => {
    try {
      // dynamic import: runtime is warmed after session_start per PLG4; static import would block factory
      const { warmHarnessPolicy } = await import('./runtime.js')
      await runSafe(warmHarnessPolicy(ctx.cwd))
    } catch (error) {
      // fail-open: warm failure leaves NoInjectRefs at default ['AGENTS.md']; custom no_inject_refs is ignored so user-suppressed refs may be over-injected
      try {
        pi.logger.warn('[omp-claude-compat] warmHarnessPolicy failed', { error, cwd: ctx.cwd })
      } catch {
        // logger must never throw
      }
    }
  })
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_e, ctx) => warm(ctx)), () => import('./runtime.js'))
}
