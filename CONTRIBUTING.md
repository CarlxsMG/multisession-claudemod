# Contributing to crew

Thank you for helping. This file covers how to set up, the checks a change must pass, and the
rules the code follows. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the plugin works and
defines its vocabulary; read it before changing more than one file.

## Setup

You need Claude Code 2.1.318 or later (the release CI pins, `CLAUDE_CODE_VERSION` in
`.github/workflows/ci.yml`) and Node.js for `npx`.

1. Clone the repository.
2. Load the plugin from the clone, for a session that reloads it on every save:

   ```
   cd <a project to try it in>
   claude --plugin-dir <path to the clone>
   ```

   If you also have crew installed from a marketplace, disable that one first (`/plugin`), so it
   does not load twice.

   Or install the clone as a local marketplace, for every session of your user:

   ```
   claude plugin marketplace add <path to the clone>
   claude plugin install crew@<the name in .claude-plugin/marketplace.json> --scope user
   ```

   The plugin is always read from the clone. After an edit, run `/reload-plugins` in an open
   session.

Loading the plugin once also writes `.claude-plugin/types/`: the engine's type declarations
(about 1 MB), which `tsc` needs. The folder is gitignored, because Claude Code generates it and
it lists the MCP tools connected on your machine.

## Checks

Every change passes all four:

```
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
npx --yes prettier@3.9.10 --check .
```

- `validate` checks the manifest, the marketplace and the hooks module, including which state
  each hook reads and writes. CI runs it with `--strict --profile directory`.
- `test` runs every `*.test.ts` and `*.test.tsx` under `tests/`, each file in a child of
  Claude Code, against the engine's test kit (`claude-code/testing`). It takes about a minute,
  most of it the kit loading the plugin afresh for each test.
- **One full `test` run at a time.** A single run already uses every core, so full runs made at
  once (several worktrees each running the checks) stretch every test by about the number of runs,
  and the tests nearest the 15 s limit fail at exactly that limit, `timed out after 15000 ms`, a
  different set each time: 9 or 10 of them with two runs on a 32-thread machine, about 120 with
  four. Nothing in the tests waits on real time, so such a failure says the machine was busy, not
  that the change is wrong: run the suite again alone before looking into it. The limit is not
  raised for this (see [Tests](#tests)): four runs at once would need about 60 s for every test and
  still take six times as long as one alone.
- `tsc` needs `.claude-plugin/types/`, so it does **not** run on a fresh clone: load the plugin
  once first (see Setup). `validate` and `test` need no generated types, which is why CI runs those
  two and not this one. **`tsc` is a local check**: CI cannot run it, so a type error reaches `main` unless
  you run it before you push. Claude Code writes the types only when a session loads the plugin,
  and a runner has no login: a headless `claude --plugin-dir . -p` with none, or with a placeholder
  API key, ends before it writes them, `validate`, `test` and `plugin init` write none, and no
  package publishes them (checked on 2.1.318).
- `prettier` checks the layout of the code and config, as `.prettierrc.json` sets it; `--write` in
  place of `--check` fixes what it reports. `.prettierignore` leaves out Markdown and
  `tests/golden/model-text.ts`. The version is pinned (`PRETTIER_VERSION` in
  `.github/workflows/ci.yml`) because a new release can move lines: raise it in a commit of its own
  that holds the reformat, and list that commit in `.git-blame-ignore-revs`, which GitHub's blame
  reads and `git config blame.ignoreRevsFile .git-blame-ignore-revs` makes yours read.
- CI runs `test` on Linux, Windows and macOS. A pull request merges once `validate`, `prettier` and
  the Linux and Windows tests pass: a macOS runner can take a long time to start, so that job does not hold
  the merge. It still runs on every pull request and push, and a failed one is a failure to fix.

## How the code is written

- **English** for code, identifiers and comments. The UI's text lives in the locale tables (see
  [docs/i18n.md](docs/i18n.md)), never in a component.
- **A comment says why the code is as it is now**, never its history: not what changed, what it
  used to be, who or when. No commented-out code. Every module opens with a `//` header saying
  what it is for, and every export has a JSDoc comment.
- **Style:** Prettier sets the layout (no semicolons, single quotes, two-space indent, 160 columns).
  It does not sort imports: named imports go in ASCII order.
- **The runtime strips types only:** no `enum`, no parameter properties, nothing else in
  TypeScript that emits code.
- **A module's `let` cannot be assigned from another module.** What a load keeps in memory beside
  the atoms lives in `src/runtime.ts`, one part per module that reads and writes it; another
  module goes through that module's functions. `session.start` sets it afresh
  (`resetRuntime`).
- **Engine calls that must not break a turn or a timer** go through `quiet()` (`src/engine.ts`),
  which logs the failure to the debug log.

## What the validator forces

`claude plugin validate` reads the code statically, and that shapes it:

- **Every atom is read and updated only in `src/state/atoms.ts`**, through its `readX`/`updateX`
  pair. The validator finds the state a hook touches only where the atom is declared.
- **Hook matchers are written inline in `hooks/register.tsx`**, the plugin's one hooks module
  (`CREW_TOOLS` included). The validator reads a matcher's value only from the file that registers
  the hook, not through an import.
- **Hook bodies are `function` declarations.** The validator follows `$` across an import only
  into function declarations.
- **`$` is passed as itself, never inside an object.** The validator refuses `$` bound, spread or
  put in an object, so a function that needs it takes it as an argument of its own.

## What must never change

Users keep data across sessions and plugin versions, and pass share codes to each other. So these
are frozen (see ARCHITECTURE.md, State and persistence):

- the store keys (`STORE_KEYS`: `look`, `isOn`, `lines`, `toldBy`, `progress`);
- the state keys in `types/index.d.ts` (`PluginState.crew`), including the ones whose code name
  differs (`members` is `cast`, `pendingRows` is `due`, `paneTick` is `beat`, `pendingNote` is
  `note`, `editTab` is `tab`, `moodLines` is `lines`, `mainModel` is `model`);
- the `CREW1.` prefix of share codes, and the field names of `Look` (`skin`, `hair`, `facial`,
  `shirt`, `pants`, `shoes` keep the names of the time the figures were people);
- the part keys of the catalog and the positions in its colour tables, which a look stores;
- the tool names `mcp__crew__delegate`, `mcp__crew__roster`, `mcp__crew__progress`, and the plugin
  name `crew`.

When the fields of a stored value change incompatibly, give its atom a new **shape tag**
(`messages-1` to `messages-2`): the tag declines what an earlier version stored. An added
optional field keeps the tag.

## Text a model reads

Nearly every text a model reads is in `src/prompts/`: the orchestrator's brief, the workers'
preamble, the tool specs, the tool results, the roster, the `[crew]` note and what `/crew` answers.
[docs/model-behavior.md](docs/model-behavior.md) lists each one, who reads it and when, and the few
that live elsewhere. All of it is model behaviour, so:

- it stays in English whatever the UI's language;
- `tests/golden/model-text.ts` holds each text exactly, one line per element. A wording change
  fails `tests/model-text.test.tsx`; update the golden file by hand in the same commit, and say in
  the commit message why the model should read the new text;
- the `delegate` tool's description must stay under 3950 characters (Claude Code cuts a tool
  description at 4096) and holds no setting. A test checks it.

Progress never reaches a model, apart from the progress tool's reply and an active worker's step
in the roster. Keep it that way: the status line, the pane, the toasts and the placed rows are
drawn only.

## Text people read

UI text goes in both locale tables, `src/i18n/en.ts` and `src/i18n/es.ts`, in the same commit.
[docs/i18n.md](docs/i18n.md) has the details. If you do not speak Spanish, say so in the pull
request and someone will translate it.

## Tests

- `tests/support/crew.ts` is the shared kit, the one import a test needs. It gathers `engine.ts`
  (an `engine(on)` that answers beneath the plugin, and the kit's `test`), `fixtures.ts` (crews at
  work, inputs, and what mounts and reads their drawings) and `raster.ts` (what reads a figure's
  cells back). A test that loads the plugin imports `test` from it rather than from
  `claude-code/testing`, because its `test` passes the plugin under test its options and gives it
  15 s.
- **Tests read the English UI**, the product's default: the kit passes `language: 'en'` to the
  plugin, and what a test imports from `src` speaks English too unless its file calls `setLocale`
  (the plugin under test and the test file do not share module instances). Spanish is covered by
  `tests/spanish.test.tsx`, which calls `setLocale('es')` and passes each test
  `{ options: { language: 'es' } }`, the width tests in `tests/progress-pane.test.tsx`, which run
  in both languages, `tests/locale.test.tsx` and `tests/unit/i18n.test.ts`. Another test that needs
  Spanish passes `{ options: { language: 'es' } }` and says why.
- `tests/unit/` tests pure modules; `tests/golden/` holds the model-facing texts.
- **The test's clock runs the plugin's timers** on the way to wherever it advances to, so a test
  advances it no further than it needs.
- **Put a test in the file it fits before starting a new one.** The suite starts a child per file,
  as many at once as the machine has threads, and past eight or so they only wait on each other to
  load the plugin: on a 32-thread machine a load takes about N / 7.5 s with N files running.
- Every bug fix comes with a test that fails without it.
- **A test has 15 s**, where the kit alone gives it 5 s. A file's first tests to load the plugin
  meet the machine at its busiest, with every other file doing the same, and the load can take
  most of 5 s. A test that hangs is noticed that much later.

## Commits and pull requests

- One logical change per commit. The subject says what the change achieves, in English, at most
  about 65 characters, without a period or a Conventional Commits prefix. The body says why, in
  prose, with code in backticks.
- Stage explicit paths. Never `git add -A`, `git add .` or `git commit -a`.
- Work on a branch, never on `main`. Open a pull request against `main`; fill in the template, and
  link the issue it closes.
- Pull requests are merged when CI is green and the checklist holds.

## Reporting

Bugs and ideas go to the issue tracker, questions to Discussions, and vulnerabilities to the
private report described in [SECURITY.md](SECURITY.md).
