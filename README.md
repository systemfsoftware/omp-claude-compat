# @systemfsoftware/omp-claude-compat

Claude Code compatibility layer for Oh My Pi.

Allows Oh My Pi agents to seamlessly execute `.claude/settings.json` hook configurations and resolve `CLAUDE.md` `@-references`.

## Features

- **Hook Dispatcher:** Executes user-defined pre/post command lifecycle hooks from `.claude/settings.json`.
- **Instruction Injection:** Dynamically parses and injects linked markdown references directly into prompt context.
- **Non-Blocking Runtime:** Integrates with Effect's execution loop while keeping initial plugin registration instantaneous.

## Installation

Clone the standalone repo and install:

```bash
git clone https://github.com/systemfsoftware/omp-claude-compat
cd omp-claude-compat
pnpm install
```

Add the extension to your Oh My Pi configuration:

```json
{
  "plugins": [
    "@systemfsoftware/omp-claude-compat"
  ]
}
```

Or install manually via package manager:

```bash
pnpm add @systemfsoftware/omp-claude-compat
```

## How It Works

- **Configuration Discovery:** Automatically locates `.claude/settings.json` at project root and binds relevant hook handlers to corresponding agent lifecycle events.
- **File Reference Resolving:** Matches `@path/to/file` directives in instructions and substitutes live file contents at execution time.

## Development

```bash
pnpm build
pnpm test
```

## License

Apache-2.0
