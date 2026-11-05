# Changelog

All notable changes to crew are written here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A `usageProbe` option (`on` or `off`, `on` by default) that turns off the headless `claude -p`
  the crew runs for Fable's weekly window; with `off` the pane shows the engine's windows only.

### Changed

- Finished workers (done, failed or stopped) leave the pane's row a few seconds after their end
  stops standing out, as free ones do; the team view and the roster still list them.
- The newest check-in in the conversation follows the round in place, its steps and phases as
  they change and its times once a minute, instead of keeping what it showed when it was placed.

### Fixed

- No two workers share a name any more: two forks started in one response, an agent a worker
  starts, and a worker cleared with `/crew clear` each keep a name of their own. Names are 2 to
  4 characters, so a card shows them whole; a name an Agent call gives that is longer, shorter
  or taken is replaced, and the call is told the name and the address. Past the last name of the
  pool, workers take a letter and a number (`A1`).
- A full model id given to `delegate` (`claude-sonnet-4-5`) starts the worker on its family's
  alias, and reuses one asked for that alias, instead of failing the spawn; a model that names
  no family is turned down with the aliases it takes.
- A worker's message to a free teammate that failed on its way no longer loses the messages
  queued after it: each is sent on by itself.

## [0.1.0] - 2026-11-05

The first public release.

### Added

- A pane beside the chat (`/crew`) with the orchestrator, a mascot you design, its speech bubble,
  the Delegate ON/OFF switch, the account's usage windows, a card per worker with its state, step
  or time, a team view and a feed of the crew's messages.
- Delegation by default: the orchestrator's brief in the system prompt and the `delegate` tool's
  description, frozen per load, with later setting changes told in a `[crew]` note.
- The `mcp__crew__delegate`, `mcp__crew__roster` and `mcp__crew__progress` tools: workers that
  are reused with their context, named or by repository; held tasks for a worker another worker
  woke; plans and steps declared by workers.
- Workers that report briefly, follow git rules (their own commits, never on the main branch
  unless asked), work in worktrees when asked, and message each other, a message to a free
  teammate being sent on from the main conversation.
- Bubbles in the conversation for the crew's calls and reports (terminal), drawn only.
- Progress no model reads: a status line, end toasts, lines for messages between workers,
  check-ins every few minutes and a summary per round; `/crew progress` sets their interval.
- A mascot editor, six personalities with fixed lines and a batch Haiku writes, and `CREW1.`
  share codes.
- An English and a Spanish UI, chosen by the `language` option or Claude Code's language setting.
- macOS, Linux and Windows support, with figures drawn as cells on the terminal and SVG in the
  desktop app, the editors and on the phone.

[Unreleased]: https://github.com/CarlxsMG/multisession-claudemod/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CarlxsMG/multisession-claudemod/releases/tag/v0.1.0
