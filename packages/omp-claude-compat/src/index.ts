import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'

export default async function claudeCompatExtension(pi: ExtensionAPI): Promise<void> {
  const { lazyRunSafe, warmRuntimeAfterStart } = await import('./bootstrap.js')
  const runSafe = lazyRunSafe(() => import('./runtime.js'))
  const [
    { HookDispatcherTask },
    { InjectInstructionsTask },
    { dispatchToolCall },
    { dispatchToolResult },
    { Effect, Option },
    { homeDir },
  ] = await Promise.all([
    import('./hooks/mod.js'),
    import('./inject/mod.js'),
    import('./hooks/tool-call.js'),
    import('./hooks/tool-result.js'),
    import('effect'),
    import('./internal/host-env.js'),
  ])
  HookDispatcherTask(pi, runSafe)
  const handlerCeilingMs = 28_000
  pi.on('tool_call', (event, ctx) => {
    const timed = dispatchToolCall({
      event,
      ctx: {
        cwd: ctx.cwd,
        homeDir: homeDir(),
        sessionManager: ctx.sessionManager,
        ui: ctx.ui,
      },
    }).pipe(Effect.timeoutOption(handlerCeilingMs))
    return runSafe(timed).then((result) => Option.getOrUndefined(result))
  })
  pi.on('tool_result', (event, ctx) => {
    const timed = dispatchToolResult({
      event,
      ctx: {
        cwd: ctx.cwd,
        homeDir: homeDir(),
        sessionManager: ctx.sessionManager,
        ui: ctx.ui,
      },
    }).pipe(Effect.timeoutOption(handlerCeilingMs))
    return runSafe(timed).then((result) => Option.getOrUndefined(result))
  })
  InjectInstructionsTask(pi, runSafe)
  pi.on('session_start', async (_e, ctx) => {
    try {
      const { warmHarnessPolicy } = await import('./runtime.js')
      await runSafe(warmHarnessPolicy(ctx.cwd))
    } catch (error) {
      try {
        pi.logger.warn('[omp-claude-compat] warmHarnessPolicy failed', { error, cwd: ctx.cwd })
      } catch {
        // logger must never throw
      }
    }
  })
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_e, ctx) => warm(ctx)), () => import('./runtime.js'))
}
