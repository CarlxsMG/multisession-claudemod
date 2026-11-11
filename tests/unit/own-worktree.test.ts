import { expect, test } from 'claude-code/testing'

import { addsWorktree } from '../../src/crew/own-worktree'

test('a command that runs `git worktree add` makes a worktree, chained, wrapped or with options of git ahead', () => {
  expect(addsWorktree('git worktree add ../api-pip -b crew/pip-login')).toBe(true)
  expect(addsWorktree('cd /work/api && git worktree add ../api-pip -b crew/pip-login origin/main')).toBe(true)
  expect(addsWorktree('git fetch origin; git worktree add ../api-pip')).toBe(true)
  expect(addsWorktree('git -C /work/api worktree add ../api-pip -b fix/login')).toBe(true)
  expect(addsWorktree('git --no-pager -c core.longpaths=true worktree add ../api-pip')).toBe(true)
  expect(addsWorktree('GIT_TRACE=1 git worktree add ../api-pip')).toBe(true)
  expect(addsWorktree('git.exe worktree add ..\\api-pip -b crew/pip-login')).toBe(true)
  expect(addsWorktree('git status\ngit worktree add ../api-pip')).toBe(true)
})

test('a command that only reads, removes or names worktrees makes none', () => {
  expect(addsWorktree('')).toBe(false)
  expect(addsWorktree('git worktree list --porcelain')).toBe(false)
  expect(addsWorktree('git worktree remove ../api-pip')).toBe(false)
  expect(addsWorktree('git worktree prune')).toBe(false)
  expect(addsWorktree('git log --grep "worktree add"')).toBe(false)
  expect(addsWorktree('echo git worktree add ../api-pip')).toBe(false)
  expect(addsWorktree('gitk worktree add')).toBe(false)
  expect(addsWorktree('git add worktree')).toBe(false)
  // A quoted path with a space is not read as one word: taken as making none.
  expect(addsWorktree('git -C "/work/my api" worktree add ../api-pip')).toBe(false)
})
