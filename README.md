# @systemfsoftware/omp-claude-compat

> The state of the art in Claude Code compatibility for Oh My Pi. Your `.claude` setup works here — exactly like it does in Claude Code. Nothing else is close.

`@systemfsoftware/omp-claude-compat` brings your Claude Code configuration into [Oh My Pi](https://github.com/can1357/oh-my-pi) (OMP). Your hooks keep firing. Your `CLAUDE.md` rules keep applying. You change nothing — install one plugin and your existing setup just works.

[![npm version](https://img.shields.io/npm/v/@systemfsoftware/omp-claude-compat?style=flat)](https://www.npmjs.com/package/@systemfsoftware/omp-claude-compat)
[![license](https://img.shields.io/npm/l/@systemfsoftware/omp-claude-compat?style=flat)](./LICENSE)

## What is this?

This is a plugin for Oh My Pi that understands Claude Code configuration. It runs the hooks you defined in `.claude/settings.json` at the right moments, and it feeds the files your `CLAUDE.md` points at into the agent's instructions. One plugin, zero rewriting of your existing files.

## Install

**How do I use my Claude Code setup in Oh My Pi?** Install the package and list it as a plugin:

```bash
pnpm add @systemfsoftware/omp-claude-compat
```

```bash
npm install @systemfsoftware/omp-claude-compat
```

```json
{
  "plugins": [
    "@systemfsoftware/omp-claude-compat"
  ]
}
```

> [!NOTE]
> Installing never slows anything down. The plugin loads instantly; your hooks run in the background when their moment comes.

## Usage

**Do I need to convert my Claude Code files?** No. Leave your project exactly as it is:

```bash
my-project/
├── .claude/
│   └── settings.json      # your Claude Code hooks — untouched
├── CLAUDE.md              # your instructions — untouched
└── omp.json               # just add the plugin here
```

Your hooks fire when they should — before a tool runs, after it finishes, when a session starts, when you send a prompt. And when your `CLAUDE.md` says `@docs/rules.md`, the agent actually reads `docs/rules.md` and follows it. The contents are always read fresh, so editing the file edits the behavior. Nothing goes stale.

## Which hooks work?

**Will all my Claude Code hooks run?** The nine hooks that have a true equivalent in Oh My Pi run — with the same meaning and the same decisions honored:

| What you configured        | What happens in Oh My Pi                                |
| -------------------------- | ------------------------------------------------------- |
| Run before a tool executes | Runs before the tool executes — can still block it      |
| Run after a tool finishes  | Runs after — can still adjust the result                |
| Run when a tool fails      | Runs on failure, then the original error still surfaces |
| Run when I submit a prompt | Runs when you send a message                            |
| Run at session start / end | Runs at session start / shutdown                        |
| Run on stop                | Runs on stop                                            |
| Run around compaction      | Runs before and after context compaction                |

**What about the rest?** Some Claude Code events have no equivalent in Oh My Pi — there is no subagent identity to hook, no file-watch signal, no approval override. Those are documented with the reason why, in the source, instead of failing silently. A hook that can't mean the same thing here doesn't pretend to.

## Where do settings come from?

**I have settings in several places — which wins?** Four layers merge, each overriding the last: your personal `~/.claude/settings.json`, the project's `.claude/settings.json`, the project's local overrides, and the machine-managed policy file. Plugins you've enabled can add their own hooks on top. Put shared rules in the project file, personal secrets in your home file, done.

**Can a hook hang my session?** No. Every hook runs under a time budget — roughly 24 seconds max — and the agent moves on if one misbehaves. Your prompt-submit hooks get about 30 seconds, matching Claude Code's own default.

## How do `@`-references work?

**How do I share rules across files?** Write `@path/to/file` on its own line in `CLAUDE.md`, and the agent will read that file's contents as part of its instructions. Both `CLAUDE.md` and `.claude/CLAUDE.md` at your project root are picked up.

```markdown
# CLAUDE.md

@docs/coding-rules.md
@docs/review-checklist.md
```

**Can I exclude a file?** Yes. `AGENTS.md` is excluded by default (it already reaches the agent through its own channel). You can change the exclusion list with a small settings file — personal, project, or local — so each layer of your team controls its own.

## Why this instead of scripts?

**Can't I just wire up a few shell scripts?** You can, until either side changes and your scripts silently do the wrong thing. This package pins the Claude Code behavior it matches, states openly which hooks have no equivalent and why, and proves it all with automated tests that re-run on every change.

| Approach                             | Keeps working                        | Admits its limits       | Tested                       |
| ------------------------------------ | ------------------------------------ | ----------------------- | ---------------------------- |
| `@systemfsoftware/omp-claude-compat` | ✅ tracks Claude Code semantics      | ✅ every gap documented | ✅ automated, mutation-gated |
| Hand-rolled scripts                  | ❌ rots on the first upstream change | ❌ fails silently       | ❌ you                       |
| Copy-pasting file contents           | ❌ stale the moment you edit         | n/a                     | ❌ you                       |

## Troubleshooting

**My hooks aren't firing. Now what?** First check a settings file actually exists in one of the four places above. Then check whether the file uses a `hooks` wrapper with stray top-level entries (the strays are ignored by design), or whether hooks were switched off in that file.

**My `@`-reference loads nothing?** Three usual suspects: the path must be relative (no absolute paths), with no spaces, pointing inside your project. And `AGENTS.md` is excluded on purpose — reference it and you'll get silence.

**Starting a session feels slow?** It's not the plugin — it loads instantly. Look at your hooks: one of them is probably slow, and the time budget note in the logs will say which.

**Something behaves differently than Claude Code?** That's a bug, and it's the one we care about most. Open an issue with your hook config, the `CLAUDE.md` snippet, and what you expected versus what you got. Matching Claude Code is the entire point of this package.

## Contributing

Issues, ideas, and corrections: the [issue tracker](https://github.com/systemfsoftware/omp-claude-compat/issues) is the front door. Development workflow lives with the code — start from `package.json` scripts (`build`, `test`, `lint`, `typecheck`).

## Support

Bug reports and feature requests: the [issue tracker](https://github.com/systemfsoftware/omp-claude-compat/issues).

## License

[Apache-2.0](LICENSE).
