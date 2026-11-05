# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately on this repository: **Security > Report a
vulnerability**. Include the crew and Claude Code versions (`claude --version`), the surface (CLI,
Desktop or IDE), the operating system, the steps to reproduce and the impact. The report is
credited in the fix unless you prefer otherwise.

Only the latest release is supported: a fix ships in a new release, not in older ones.

## Scope

crew is a Claude Code plugin that runs inside your session, with the rights Claude Code gives a
plugin. It keeps its state on your machine and starts background agents only through Claude Code.
In scope:

- a share code, a message between agents or any other text that makes crew run a command, write a
  file or start, wake or stop an agent that nobody asked for;
- a worker, or text a worker read, that gets crew to act as the orchestrator or as the person, for
  example delegating, messaging or changing settings on their behalf;
- crew sending anything from your session off your machine, or writing it outside its own state.

Out of scope:

- what an agent does with its tools: Claude Code's permissions decide that, not crew;
- a vulnerability in Claude Code itself: report it to Anthropic, following its
  [responsible disclosure policy](https://www.anthropic.com/responsible-disclosure-policy).
