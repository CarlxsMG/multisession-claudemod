# crew

[Español](README.es.md)

A Claude Code plugin that turns your session into a team you can see. You talk to one
orchestrator, a pixel-art mascot you design yourself. It hands the work to workers (background
subagents, one per repository or task) and coordinates them, and every worker shows up in a pane
beside the chat as an outlined diamond in its own colour that works, naps, cheers or fails as it
happens.

## What it does

- **A pane beside the chat** (`/crew`). On top, the orchestrator on its podium with its name, its
  personality, the model the session runs on and a speech bubble that follows what it is doing.
  Beside it, the **Delegate ON/OFF** switch, **Edit**, and your account's usage windows (`5h`,
  `week`, and Fable's own weekly window) in green, yellow from 50 % and red from 80 %.
- **Worker cards.** A row of diamonds, one per worker, each in its colour with its own pair of
  signs. A mark in the corner says what it is doing (`+` starting, `|/-\` working, `?` waiting,
  `.oO` thinking, `>` delegating, `*` cheering, `✓` done, `zZ` asleep, `!` failed, `■` stopped).
  Under its name: its plan's step (`3/5`), or how long its run has taken, or a four-letter word
  (`init`, `wait`, `done`, `fail`, `stop`). A worker that is free or has finished (done, failed
  or stopped) leaves the row a few seconds later, once its end has stood out (how long is a
  [setting](#settings)), and stays in the team view (`/crew team`), which lists every worker with its status, repository, task, what it is
  doing and its run's time and calls.
- **A feed of the crew's messages**, newest first: the two newest as chat bubbles that type out,
  older ones as one quiet line each.
- **Delegation by default.** With Delegate ON, the orchestrator's system prompt and the
  `delegate` tool's description tell it to hand everything but quick answers to the crew, to
  reuse the worker that already knows an area, to run independent parts in parallel and to
  steer workers with `SendMessage`. The brief is frozen for the load, so the prompt cache stays
  whole; later changes reach the model as one short `[crew]` note with your next message.
- **Three tools for the orchestrator.** `mcp__crew__delegate` gives a task to a worker: the one
  you name, the most recent free one that worked in that repository (it keeps its context), or a
  new one. `mcp__crew__roster` lists the crew for the model. Workers call `mcp__crew__progress`
  to declare a plan and the step they are on.
- **Workers that report briefly and work safely.** Every worker hears that its report goes back to
  a conversation that must stay small: result first, then facts. In a git repository it commits
  its own work on a `crew/*` branch or worktree, never on the main branch unless you asked.
- **Workers talk to each other.** A message to a busy teammate arrives at its next tool call; one
  to a free teammate wakes it, sent on from the main conversation so its report comes back to the
  orchestrator. A task for a worker that another worker just woke waits and follows once that run
  ends.
- **Bubbles in the conversation** (terminal). What the orchestrator sends a worker, and what the
  worker sends back, are drawn as bubbles in the worker's colour:

  ```
  ╭─ Nova → Pip · Fix the tests ──────╮
  │ Run the tests and fix what fails. │
  ╰─ new · ! Bolt works here ─────────╯
  ╭─ Pip → Nova · ✓ done · 2m 5s ─╮
  │ Fix the tests                 │
  ╰───────────────────────────────╯
  ```

  Drawing only: what is stored and what any model reads stay as they were. ctrl+o shows each one
  whole.

  Which surface shows what:

  | Where | The crew's rows in the conversation |
  | --- | --- |
  | Terminal | The bubbles above. An editor that runs Claude Code in its own terminal, as JetBrains IDEs do, shows these. |
  | Desktop app and VS Code | One-line cards: the worker's figure, who to whom, the title, the foot and how it ended. A press on `▸` shows the task or the report whole. |
  | Phone | Claude Code's own rows. |

  ```
  ◆ Nova → Pip · Fix the tests · new                 ▸
  ◆ Pip → Nova · All 42 tests pass; the fix was in…  ▸
  ◆ Pip → Nova · ✓ done · 2m 5s · Fix the tests
  ```

  The pane shows the crew on all of them.

  The crew keeps nothing of a conversation on disk, so after Claude Code restarts a resumed
  conversation's earlier bubbles are drawn from what each row holds: the worker's name in the
  orchestrator's calls and in what workers send, a task's title in its delegate bubble, and how a
  run ended and how long it took when its end notice says. A worker's colour comes back where the
  row carries its id (a call that started or woke it, a stop, an end notice); elsewhere the
  bubble is grey. An end notice names no worker or title (`crew → Nova · ✓ done · 2m 5s`), and
  the step a failed run stood on and the run times the crew measured itself do not come back.
- **Progress that no model reads.** A status line under the prompt
  (`crew · Pip 3/5 6m Fix the tests · Bolt reading 4m`), a toast when a run ends, a line in the
  conversation for each message between workers, and a check-in every 3 minutes while anyone
  works (only when something changed), closed by a summary of the round. The newest check-in
  follows the round where it stands, its steps and phases as they change and its times once a
  minute; the ones before it fold to a line of what they showed. The only progress a model reads
  is an active worker's step in the roster.
- **Your mascot.** An editor with tabs for its character, face, head, body, extras and sharing.
  Six personalities (cheerful, zen, pirate, boss, geek, granny) colour how it talks. Its fixed
  lines rotate, and Haiku writes an extra batch once per personality, kept across sessions.
- **Share codes.** `/crew code` copies a `CREW1.…` code that someone else imports with
  `/crew import <code>`.
- **English and Spanish.** The UI follows Claude Code's language setting, or the plugin's
  `language` option. What `/crew` answers stays in English, as it reaches the model.

## Install

From Claude Code:

```
/plugin marketplace add CarlxsMG/multisession-claudemod
/plugin install crew@multisession-claudemod
```

Or from a shell:

```
claude plugin marketplace add CarlxsMG/multisession-claudemod
claude plugin install crew@multisession-claudemod --scope user
```

Then open the pane with `/crew`. Enable or disable the plugin from `/plugin`.

To work on the plugin itself, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- Claude Code 2.1.318 or later (the release the tests and validation run on in CI).
- For the pane docked to the right: a wide terminal in full screen (from about 110 to 144
  columns). In a narrower terminal the pane opens above the prompt.
- For the usage windows: a Claude subscription. With an API key they do not show.

## Commands

| Command | What it does |
| --- | --- |
| `/crew` | Opens the pane |
| `/crew team` | Every worker, one to a row |
| `/crew edit` | Customize your mascot |
| `/crew msg <worker> <text>` | Send a worker a message |
| `/crew code` | Copy your mascot's share code |
| `/crew import <code>` | Import a mascot from a share code |
| `/crew random` | A random mascot (keeps its name and phrase) |
| `/crew mode on\|off` | Whether the orchestrator delegates on its own |
| `/crew clear` | Take the finished workers off the pane |
| `/crew progress` | A check-in of how the workers are doing, now |
| `/crew progress 1m\|2m\|3m\|5m\|10m\|off` | How often check-ins come (3m by default) |

The Spanish verbs (`equipo`, `editar`, `codigo`, `importar`, `aleatorio`, `modo`, `limpiar`,
`progreso`) work in any language, though `/crew`'s help lists the English ones. With the pane focused, Tab moves between its buttons and Enter
presses one. In the editor: `r` random, `d` done (`l` in Spanish) and, in Share, `c` copies the
code.

## Settings

- **Language** (`language` option of the plugin: `auto`, `en` or `es`; `auto` by default). With
  `auto`, the crew speaks the language of Claude Code's `language` setting (`Español`, `spanish`,
  `es-ES`…), and English when it names one the crew does not have. Everything a model reads stays
  in English whatever the UI speaks, and that includes what `/crew` answers, its help too: Claude
  Code stores it in the conversation.
- **Delegation** (`/crew mode on|off`, or the pane's switch). Kept across sessions.
- **Check-in interval** (`/crew progress 1m|2m|3m|5m|10m|off`). Kept across sessions. `off` stops
  the check-ins and the round summary, not the status line, the end lines or the pane.
- **Usage probe** (`usageProbe` option of the plugin: `on` or `off`; `on` by default). Fable's
  weekly window is only in `/usage`, so the crew asks a headless `claude -p` for it (the SDK's
  `get_usage` request, no plugins, no session, no tokens, about 3 s in the background), at most
  every 3 minutes, and only from an interactive session or one with the desktop app or an editor
  attached. A `-p` session never runs it. With `off` it never runs, and the pane shows the 5-hour
  and weekly windows only, which come from the engine.
- **Nap after** (`napAfter` option of the plugin: `5s`, `30s`, `2m` or `never`; `5s` by default).
  How long a free or finished worker stays in the pane's row once its status changes. A finished
  one stays at least while its end stands out (30 s), whatever the setting; with `never` no worker
  leaves the row. One that left is still in the team view and the roster, and comes back when it
  is woken.

## Compatibility

- macOS, Linux and Windows. On Windows, `repo` takes `C:\path`, `c:/path`, Git Bash's `/c/path`,
  relative paths with either slash, `~\path` (the user folder, `USERPROFILE`, even without `HOME`)
  and network paths (`\\server\share`); case and slashes do not tell repositories apart.
- The terminal draws the figures as cells and repaints them in place; the desktop app, the editors
  and the phone draw them as SVG. See **Bubbles in the conversation** for what each draws of the
  crew's rows.
- Windows Terminal and macOS Terminal look the same: the marks are characters that Cascadia Mono,
  SF Mono and Menlo all have.
- Terminal.app, which Claude Code paints with 256 colours, gets each figure colour as the nearest
  xterm colour to the eye, unless `COLORTERM=truecolor` (macOS 26 and later) or `FORCE_COLOR=3`.
  For figures without stripes, use Menlo Regular with character spacing 1 and line spacing 0.805,
  and turn off "Unicode East Asian Ambiguous characters are wide".

## Troubleshooting

- **The pane does not open.** It opens only with a surface attached (a terminal or an app), and
  opens when one attaches. Run `/crew`.
- **`delegate` starts nothing in the desktop app's auto mode.** Auto mode reviews only the calls
  the model writes, so the Agent call `delegate` makes gets no verdict. `delegate` then tells the
  orchestrator to start the worker itself with the Agent tool, and the crew takes that agent as
  the worker.
- **No usage figures.** You are on an API key, or the session is a headless `-p` one.
- **The UI is in the wrong language.** Set the plugin's `language` option, or Claude Code's
  `language` setting.
- **Streaky figures in Terminal.app.** See the font settings under Compatibility.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the checks and the conventions;
[ARCHITECTURE.md](ARCHITECTURE.md) explains how the plugin works, with a glossary; and
[docs/i18n.md](docs/i18n.md) explains how the UI's text is translated.

## License

[MIT](LICENSE)
