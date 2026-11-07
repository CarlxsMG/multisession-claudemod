# crew

A Claude Code plugin: a mascot orchestrator that hands work to a crew of background workers. This
file is the short list for agents working on the repository. The full rules and the reasons for
them are in [CONTRIBUTING.md](../CONTRIBUTING.md). How the plugin works, its module map and its
vocabulary are in [ARCHITECTURE.md](../ARCHITECTURE.md): read it before changing more than one file.

This file is in `.claude/` because the repository's root is the plugin's root, where
`claude plugin validate --strict` warns of a `CLAUDE.md`. Claude Code reads it from here all the same.

## Checks

Every change passes all four:

```
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
npx --yes prettier@3.9.10 --check .
```

- `tsc` needs `.claude-plugin/types/`, which is gitignored and which Claude Code writes when a
  session loads the plugin. A fresh worktree does not have it: copy the folder from a checkout that
  does. CI cannot run `tsc`, so a type error reaches `main` unless you run it before you push.
- CI runs `validate` with `--strict --profile directory`, which also fails on warnings the plain
  command lets pass. Run that form when you add a file at the root or touch the manifest.
- `--write` in place of `--check` fixes the layout. Prettier leaves out Markdown and the golden file.

## What the validator forces

- One hooks module, `hooks/register.tsx`, with every matcher written as a literal inside it
  (`CREW_TOOLS` too). The validator does not read a matcher through an import.
- Hook bodies live in `src/` as `function` declarations, so the validator can follow `$` into them.
- Every atom is read and updated only in `src/state/atoms.ts`, through its `readX`/`updateX` pair.

## Text a model reads

- It lives in `src/prompts/`, apart from the personalities' and Haiku's prompts in `src/persona/`.
  It stays in English whatever the UI's language.
- `tests/golden/model-text.ts` holds each text exactly. A wording change fails
  `tests/model-text.test.tsx`: update the golden file by hand in the same commit, and say in the
  commit message why the model should read the new text.
- The `delegate` description stays under 3950 characters. A test checks it.
- Progress reaches no model, apart from the progress tool's reply and an active worker's step in
  the roster.

## How the code is written

- English for code, identifiers and comments. UI text goes in both locale tables, `src/i18n/en.ts`
  and `src/i18n/es.ts`, never in a component.
- A comment says why the code is as it is now, never its history: not what changed, what it used to
  be, who or when. No commented-out code. Every module opens with a `//` header saying what it is
  for, and every export has a JSDoc comment.
- The runtime strips types only: no `enum`, no parameter properties.
- A bug fix comes with a test that fails without it.

## What is stored

- When the fields of a stored value change incompatibly, give its atom a new shape tag (`messages-1`
  to `messages-2`), which declines what an earlier version stored. An added optional field keeps the
  tag.
- Store keys, state keys, the `CREW1.` prefix of share codes, the field names of `Look`, the catalog's
  part keys and colour positions, and the tool and plugin names are frozen: see
  [What must never change](../CONTRIBUTING.md#what-must-never-change).

## Commits

One logical change per commit, on a branch, never on `main`. Stage explicit paths. The message rules
are in [Commits and pull requests](../CONTRIBUTING.md#commits-and-pull-requests).

## From issue to merge

- Work starts from a GitHub issue, added to the
  [Project](https://github.com/users/CarlxsMG/projects/5). No issue yet: create it first.
- One branch per issue, named `feat/`, `fix/` or `docs/` plus a topic, in its own worktree off
  `origin/main`.
- Commit, push the branch, and open a pull request against `main`. Its body fills the template and
  says `Closes #n`.
- Merge with a merge commit, `gh pr merge <n> --merge`, only once the required checks are green:
  `gh pr checks <n> --required --watch`.
- After the merge, check the issue closed. If not, close it with a comment naming the pull request.
