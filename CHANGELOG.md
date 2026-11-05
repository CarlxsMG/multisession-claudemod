# Changelog

All notable changes to crew are written here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
