import { expect } from 'claude-code/testing'
import { DEFAULT_LOOK } from '../src/figure/look'
import { REPORT_WORDS, ROSTER_FULL_REPORT_CUT, ROSTER_REPORTS, ROSTER_REPORT_CUT, ROSTER_ROWS } from '../src/config'
import { DELEGATION_RULES } from '../src/prompts/orchestrator'
import { DELEGATE_SPEC, ROSTER_SPEC } from '../src/prompts/tools'
import { lookCode } from '../src/figure/share-code'
import { VIBES } from '../src/persona/vibes'
import { COMMENT_LINE, COMPOSER, GIT_LINE, NOVA_OFF, NOVA_ON, PANE, composeBrief, crewCommand, engine, spawnAgent, startTold, test } from './support/crew'

test('the brief is part of the system prompt, and the delegation rules of the delegate tool alone', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
  engine(on, { seen })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })

  const section = await composeBrief($)
  expect(section?.scope).toBe('session')
  expect(section?.text).toMatch(
    /^This brief is for the main assistant; a worker or fork reading it ignores it and does its own task\.\nCrew: delegation was ON when this brief was written\. A "\[crew\]" note beside a user message/,
  )
  expect(section?.text).toMatch(/Delegation OFF: do the work yourself; use the crew only when the user asks\./)
  expect(section?.text).not.toMatch(/If you are a subagent reading this/)
  expect(section?.text).toMatch(/You are Nova/)
  expect(section?.text).toMatch(/\nPersona: Nova is /)
  // A rule read in both places is paid for twice in every request: the
  // brief points at the rules, and holds none of them.
  expect(section?.text).toMatch(/the crew does the work\. How to delegate: the rules in mcp__crew__delegate's description\.\nPersona:/)
  expect(section?.text.split('\n')).toHaveLength(4)
  for (const rule of DELEGATION_RULES.split('\n')) {
    expect(rule.startsWith('- ')).toBe(true)
    expect(section?.text.includes(rule)).toBe(false)
  }
  expect(seen.tools).toHaveLength(1)
  expect(seen.tools[0]!.endsWith(`\n\n${DELEGATION_RULES}`)).toBe(true)
  expect(seen.tools[0]).not.toMatch(/You are Nova|Persona:/)

  const description = seen.tools[0]!
  expect(description).toMatch(
    /- Delegate everything but answers from what you already know: reading files, running commands, edits, reviews, tests\. Doing it yourself looks quicker, but sessions run long/,
  )
  expect(description).not.toMatch(/more than a couple of tool calls|run the tests, a diffstat/)
  expect(description).toMatch(/several mcp__crew__delegate calls in one message, each `fresh` or naming its own free worker/)
  expect(description).toMatch(
    /or give each a git worktree \(Agent tool, `isolation: "worktree"`\)\.\n- Reuse context: a worker keeps all it read, also after it reports\. /,
  )
  expect(description).toMatch(/goes to the worker that knows it, named with `worker`, once its report is back; unrelated work goes to a `fresh` one\.\n/)
  expect(description).toMatch(/\n- Git: workers commit their own work, never on the main branch; merge into it, or push, only once the user says so\.\n/)
  expect(description).toMatch(/\n- Workers are models: write to them tersely, with no pleasantries, persona or prose; `task` says what a brief holds\.\n/)
  expect(description).toMatch(
    /A fork \(Agent tool, `subagent_type: "fork"`\) inherits and rereads this whole conversation, so its prompt is just the directive: /,
  )
  expect(description).toMatch(
    /- For a larger build, have one worker investigate and then fork itself once per part \(say frontend, backend and the Jira tickets\)/,
  )
  expect(description).toMatch(/Name the parts and the files each owns; it reports once its forks have\./)
  expect(description).toMatch(/Steer with SendMessage \(addresses in mcp__crew__roster\)/)
  expect(description).toMatch(/a finished worker wakes with its context/)
  expect(description).toMatch(/TaskStop a worker heading the wrong way/)
  expect(description).toMatch(/don't poll mcp__crew__roster for them/)
  expect(description).toMatch(
    /A report opens with DONE, PARTIAL or BLOCKED: one that is not DONE says what is left or asks a question, and the answer goes back to the same worker\.\n/,
  )
  expect(description).toMatch(/To check what a report left unverified, have a worker run the check/)
  // What an argument does is said in its own description, not in a rule.
  expect(description).not.toMatch(/haiku|`title`|"Explore"|A comment says why|A brief is complete in facts/)
  const args = DELEGATE_SPEC.inputSchema.properties
  expect(args.subagent_type.description).toMatch(/`Explore` for a read-only search across many files, `Plan` for a design/)
  expect(args.task.description).toMatch(/Complete in facts, as a new worker has not seen this conversation/)
  expect(args.fresh.description).toBe('Start a new worker instead of reusing a free one.')
})

test('the roster tool states its limits as the config has them', async () => {
  const limit = `up to ${ROSTER_FULL_REPORT_CUT} characters`
  expect(ROSTER_SPEC.inputSchema.properties.worker.description.includes(limit)).toBe(true)
  expect(ROSTER_SPEC.description.includes(`at most ${ROSTER_ROWS} rows`)).toBe(true)
  expect(ROSTER_SPEC.description.includes(`The ${ROSTER_REPORTS} latest workers not busy show their last report cut to ${ROSTER_REPORT_CUT} characters`)).toBe(
    true,
  )
  // The one number a text may hold of each limit is the config's.
  const numbers = `${ROSTER_SPEC.description} ${ROSTER_SPEC.inputSchema.properties.worker.description}`.match(/\d+/g) ?? []
  expect(numbers.sort()).toEqual([ROSTER_ROWS, ROSTER_REPORTS, ROSTER_REPORT_CUT, ROSTER_FULL_REPORT_CUT].map(String).sort())
})

test('workers are told to report in a few lines, and who to talk to', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })
  expect(seen.prompts[0]).toMatch(
    /goes back into Nova's conversation, which must stay small: open with DONE, PARTIAL or BLOCKED and the outcome, in one line of 120 characters at most \(the roster's list shows only that much\); then only facts: branch and commits or files changed, the checks you ran with their results and what you did not verify, blockers, decisions needed\. 200 words at most unless the task sets a length\. Don't restate the task or narrate your steps; no pleasantries, headings or diffs; quote a line only when a decision depends on it\./,
  )
  expect(seen.prompts[0]).toMatch(/you do the hands-on work\. All you send goes to models: terse, facts only, nothing the reader already knows\.\n/)
  expect(seen.prompts[0]).toMatch(/Teammates you can reach with SendMessage: none yet\./)
  expect(seen.prompts[0]).toMatch(/You keep this context after you report/)
  // The first line is told to fit what the roster's list shows of a report.
  expect(seen.prompts[0]!.includes(`in one line of ${ROSTER_REPORT_CUT} characters at most (the roster's list shows only that much)`)).toBe(true)
  expect(seen.prompts[0]!.includes(`${REPORT_WORDS} words at most unless the task sets a length.`)).toBe(true)

  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Now the login', repo: '/work/api' })
  expect(seen.sends[0]).toMatch(/^Now the login\n\nReport as before\. /)

  // Seven busy elsewhere: the newcomer hears of six.
  for (let i = 1; i <= 8; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })
  }
  const mates = /Teammates you can reach with SendMessage: (.*)\. Coordinate/.exec(seen.prompts[8]!)?.[1] ?? ''
  expect(mates.split('), ')).toHaveLength(6)
})

test('a fork of the main session hears how to report and the git rules', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => 'agent-9', seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const fork = { prompt: 'Draft the migration plan', description: 'Plan', subagentType: 'fork', fork: true }
  await spawnAgent($, fork)
  expect(seen.prompts[0]).toMatch(
    /^\[crew\] Your final message goes back into Nova's conversation, which must stay small: open with DONE, PARTIAL or BLOCKED and the outcome, in one line of 120 characters at most \(the roster's list shows only that much\); then only facts: branch and commits or files changed/,
  )
  expect(seen.prompts[0]).toMatch(GIT_LINE)
  expect(seen.prompts[0]).toMatch(/`git worktree add \.\.\/main-pip -b crew\/pip-<topic>`/)
  expect(seen.prompts[0]).toMatch(COMMENT_LINE)
  expect(seen.prompts[0]).toMatch(/no commented-out code\.\n\nDraft the migration plan$/)
  expect(seen.prompts[0]).not.toMatch(/a worker in Nova's crew|Teammates/)
})

test("a worker's fork hears only how to report: the git rules it has from its parent", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Investigate the checkout, then split it', repo: '/work/shop' })
  expect(seen.prompts[0]).toMatch(GIT_LINE)
  const fork = { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' }
  await spawnAgent($, fork)
  expect(seen.prompts[1]).toMatch(
    /^\[crew\] Your final message goes back into Pip's conversation, which must stay small: open with DONE, PARTIAL or BLOCKED and the outcome/,
  )
  expect(seen.prompts[1]).toMatch(/quote a line only when a decision depends on it\.\n\nDo the frontend$/)
  expect(seen.prompts[1]).not.toMatch(/git status|A comment says|a worker in Nova's crew|Teammates/)
})

test('a worker hears the git rules, with a worktree of its own named after it and its repository', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Fix the login', repo: '/work/main' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Update the docs', repo: '/work/api', fresh: true })
  const [pip, bolt] = seen.prompts as [string, string]
  expect(pip).toMatch(GIT_LINE)
  expect(pip).toMatch(
    /The user wants you to commit your own work as you go: one logical change per commit, a message saying why, only your own paths \(never `add -A`, `\.` or `commit -a`\)\. Push only when your task says the user asked, and the same goes for committing or merging on the main branch \(`origin\/HEAD`'s, else main, master, trunk or develop\): otherwise work in a worktree of your own, `git worktree add \.\.\/main-pip -b crew\/pip-<topic>`, and ask in your report to merge it\.\n/,
  )
  expect(pip).toMatch(COMMENT_LINE)
  // Just before how to report.
  expect(pip).toMatch(/no commented-out code\.\n- Your final message goes back into Nova's conversation/)
  expect(bolt).toMatch(/`git worktree add \.\.\/api-bolt -b crew\/bolt-<topic>`/)
})

test('an agent a worker starts reports to that worker, and the roster says whose it is', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Investigate the checkout, then split it', title: 'Checkout', repo: '/work/shop' })
  expect(seen.prompts[0]).toMatch(
    /\n- Parallel parts, once you have read what they need: fork yourself once per part \(Agent tool, `subagent_type: "fork"`\)\. Each starts from your context, so give it only its part and files; report the whole once they report\.\n- 3\+ steps: call mcp__crew__progress as you start each step, 1 to N \(the N steps you will actually take\), in the same message as that step's first tool call\.\n- In a git repository: /,
  )

  const fork = { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' }
  await spawnAgent($, fork)
  expect(seen.prompts[1]).toMatch(/^\[crew\] Your final message goes back into Pip's conversation, which must stay small/)
  const child = { prompt: 'File the Jira tickets', description: 'Tickets', subagentType: 'general-purpose', parentAgentId: 'agent-1' }
  await spawnAgent($, child)
  expect(seen.prompts[2]).toMatch(/You are Mika, a worker in Nova's crew\./)
  expect(seen.prompts[2]).toMatch(/Your repository is \/work\/shop\./)
  expect(seen.prompts[2]).toMatch(/You keep this context after you report: Pip's follow-ups carry only what is new\./)
  expect(seen.prompts[2]).toMatch(/Your final message goes back into Pip's conversation/)
  expect(seen.prompts[2]).not.toMatch(/goes back into Nova's/)

  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)
  const all = await roster()
  expect(all).toMatch(/^- Bolt: address "agent-2", starting, fork of Pip, repo \/work\/shop, fork, /m)
  expect(all).toMatch(/^- Mika: address "agent-3", starting, started by Pip, repo \/work\/shop, /m)
  expect(all).toMatch(/^- Pip: address "pip", starting, repo \/work\/shop, /m)
  await $.turn.complete({ answer: 'Frontend hecho', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'agent-2', reason: 'answer' })
  expect(await roster('agent-2')).toMatch(/^- Bolt: address "agent-2", done, fork of Pip, repo \/work\/shop, /)
})

test('a worker of a read-only type is not told how to fork, commit or write comments; any other type is', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = (task: string, type?: string) =>
    $.tool.call({ tool: 'mcp__crew__delegate', task, repo: '/work/api', fresh: true, ...(type ? { subagent_type: type } : {}) })
  await delegate('Find the callers', 'Explore')
  await delegate('Design the migration', 'Plan')
  await delegate('Fix the login')
  await delegate('Review the diff', 'code-reviewer')
  await spawnAgent($, { prompt: 'Look around', description: 'Look', subagentType: 'Explore', tool_use_id: 'toolu_1' })
  const [explore, plan, general, own, agents] = seen.prompts as [string, string, string, string, string]
  for (const short of [explore, plan, agents]) {
    expect(short).toMatch(/^\[crew\] You are \w+, a worker in Nova's crew\./)
    expect(short).not.toMatch(/fork yourself|git status|commit your own work|git worktree add|A comment says/)
    // What it can apply stays: where it works, who is there, commands that end, its plan and its report.
    expect(short).toMatch(/\n- Your repository is \/work\/(api|main)\./)
    expect(short).toMatch(/\n- Teammates you can reach with SendMessage: /)
    expect(short).toMatch(/\n- Run only commands that end: /)
    expect(short).toMatch(/\n- 3\+ steps: /)
    expect(short).toMatch(/\n- Your final message goes back into Nova's conversation/)
  }
  // A type the crew does not know may edit: it hears every rule.
  for (const full of [general, own]) {
    expect(full).toMatch(/\n- Parallel parts, once you have read what they need: fork yourself once per part/)
    expect(full).toMatch(GIT_LINE)
    expect(full).toMatch(COMMENT_LINE)
  }
  expect(general.length - explore.length).toBeGreaterThan(1000)
})

test("with delegation off, delegate's workers still hear the preamble and the Agent tool's do not", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen, stored: { isOn: false } })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Run the tests' })).toMatch(/^Started Pip/)
  expect(seen.prompts[0]).toMatch(/^\[crew\] You are Pip, a worker in Nova's crew\./)
  expect(seen.prompts[0]).toMatch(/Your repository is \/work\/api\./)
  expect(seen.prompts[0]).toMatch(/which must stay small: open with DONE, PARTIAL or BLOCKED and the outcome/)
  await spawnAgent($, { prompt: 'Look around', description: 'Look', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  expect(seen.prompts[1]).toBe('Look around')

  await done('agent-1')
  await done('agent-2')
  expect(await delegate({ task: 'Now the login' })).toMatch(/^Given to Pip/)
  expect(seen.sends[0]).toBe('Now the login\n\nReport as before. 3+ steps: mcp__crew__progress again from step 1.')
  // The Agent tool's agent never heard how to report, nor who is there: it is told in full.
  expect(await delegate({ task: 'Look further', worker: 'agent-2' })).toMatch(/^Given to Bolt/)
  expect(seen.sends[1]).toMatch(
    /^Look further\n\nTeammates you can reach with SendMessage: Pip \("pip", api\)\.\nWhen done, open with DONE, PARTIAL or BLOCKED and the outcome, in one line of 120 characters at most \(the roster's list shows only that much\); then only facts: branch and commits or files changed, the checks you ran with their results and what you did not verify, blockers, decisions needed\. 200 words at most unless the task sets a length\. Don't restate the task/,
  )
  // Nor the git rules: a fork of the main session starts as it was asked too.
  await spawnAgent($, { prompt: 'Draft it', description: 'Draft', subagentType: 'fork', fork: true, tool_use_id: 'toolu_2' })
  expect(seen.prompts[seen.prompts.length - 1]).toBe('Draft it')
})

test('a reused worker is told the teammates it was not told of, once, and nothing when none is new', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = (input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })
  const done = (agentId: string, n = 0) =>
    $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: `t-${agentId}-${n}`, agentId, reason: 'answer' })
  const AGAIN = 'Report as before. 3+ steps: mcp__crew__progress again from step 1.'

  await delegate({ task: 'Fix the login' })
  expect(seen.prompts[0]).toMatch(/Teammates you can reach with SendMessage: none yet\./)
  // Bolt starts after Pip, and Pip starts an agent of its own.
  await delegate({ task: 'Fix the styles', fresh: true })
  expect(seen.prompts[1]).toMatch(/Teammates you can reach with SendMessage: Pip \("pip", api\)\./)
  await spawnAgent($, { prompt: 'File the tickets', description: 'Tickets', subagentType: 'general-purpose', tool_use_id: 'toolu_1', parentAgentId: 'agent-1' })
  await done('agent-3')
  await done('agent-1')

  // Pip's next task names Bolt, who came after its preamble, and not the agent Pip started itself.
  await delegate({ task: 'Now the logout', worker: 'pip' })
  expect(seen.sends[0]).toBe(`Now the logout\n\nNew teammates you can reach with SendMessage: Bolt ("bolt", api).\n${AGAIN}`)
  // Told once: the task after it carries only how it ends.
  await done('agent-1', 1)
  await delegate({ task: 'And the signup', worker: 'pip' })
  expect(seen.sends[1]).toBe(`And the signup\n\n${AGAIN}`)
  // Bolt knew Pip from its preamble; the agent Pip started came after it, and is another's.
  await done('agent-2')
  await delegate({ task: 'More styles', worker: 'bolt' })
  expect(seen.sends[2]).toBe(`More styles\n\nNew teammates you can reach with SendMessage: Mika ("agent-3", api).\n${AGAIN}`)
  await done('agent-2', 1)
  await delegate({ task: 'Even more styles', worker: 'bolt' })
  expect(seen.sends[3]).toBe(`Even more styles\n\n${AGAIN}`)
  // A worker that starts later is new to Pip, and the only one that is.
  await delegate({ task: 'Write the docs', fresh: true })
  await done('agent-1', 2)
  await delegate({ task: 'Last one', worker: 'pip' })
  expect(seen.sends[4]).toMatch(/^Last one\n\nNew teammates you can reach with SendMessage: \w+ \("\w+", api\)\.\nReport as before\. /)
})

test('a worker that calls delegate starts nothing and hears how to split its task', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Investigate the checkout', repo: '/work/shop' })
  await spawnAgent($, { prompt: 'File the tickets', description: 'Tickets', subagentType: 'general-purpose', tool_use_id: 'toolu_1', parentAgentId: 'agent-1' })

  const fromPip = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Do the frontend', agentId: 'agent-1' })).result)
  expect(fromPip).toBe(
    'crew: delegate is Nova\'s tool, not a worker\'s; nothing started. To split your task, fork yourself once per part (Agent tool, `subagent_type: "fork"`) and report the whole; for work beyond it, ask Nova in your report.',
  )
  const fromChild = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'More tickets', agentId: 'agent-2' })).result)
  expect(fromChild).toMatch(/ask Pip in your report\.$/)
  expect(seen.prompts).toHaveLength(2)
  expect(seen.sends).toHaveLength(0)
})

test('an agent in a worktree is told to stay in it', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => 'agent-9', seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  const isolated = { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' }
  await spawnAgent($, isolated)
  expect(seen.prompts[0]).toMatch(/You work in your own git worktree of \/work\/main, where your shell starts: stay in it/)
  expect(seen.prompts[0]).toMatch(/Finish the task there, commit on its branch, and give its path and branch in your report\./)
  expect(seen.prompts[0]).not.toMatch(/cd there first/)

  const plain = { prompt: 'Fix more', description: 'More', subagentType: 'general-purpose', tool_use_id: 'toolu_2' }
  await spawnAgent($, plain)
  expect(seen.prompts[1]).toMatch(/Your repository is \/work\/main\. Your shell may start elsewhere: cd there or use absolute paths/)
})

test('an Agent call that was denied leaves no worktree for a later spawn', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[] }
  on('tool.call', { tool: 'Agent' }, () => ({ deny: 'The user said no' }))
  engine(on, { nextId: () => 'agent-9', seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  // A spawn under that id (none can follow a denied call) starts where any does.
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  expect(seen.prompts[0]).toMatch(/Your repository is \/work\/main\. Your shell may start elsewhere: cd there or use absolute paths/)
  expect(seen.prompts[0]).not.toMatch(/You work in your own git worktree/)
})

test('an agent a worktree worker starts works in that worktree too', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })

  await spawnAgent($, { prompt: 'Write the tests', description: 'Tests', subagentType: 'general-purpose', tool_use_id: 'toolu_2', parentAgentId: 'agent-1' })
  expect(seen.prompts[1]).toMatch(
    /- You work in Pip's git worktree of \/work\/main, where your shell starts: stay in it, not in \/work\/main, and commit your own work there\.\n/,
  )
  expect(seen.prompts[1]).not.toMatch(/of \/work\/main of your own|give its path and branch/)
  expect(seen.prompts[1]).not.toMatch(/cd there first/)
  await spawnAgent($, { prompt: 'Do the docs', description: 'Docs', subagentType: 'fork', fork: true, tool_use_id: 'toolu_3', parentAgentId: 'agent-1' })

  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster).toMatch(/^- Bolt: address "agent-2", starting, started by Pip, worktree of \/work\/main, /m)
  expect(roster).toMatch(/^- Mika: address "agent-3", starting, fork of Pip, worktree of \/work\/main, /m)
  // None of the three is busy in the repository itself.
  const started = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Update the docs' })).result)
  expect(started).toMatch(/^Started Tito/)
  expect(started).not.toMatch(/Heads-up/)
})

// The tool list heads the prompt cache: a delegate description that held a
// setting would end the cache's reuse from one session to the next.
for (const isOn of [true, false]) {
  test(`the delegate description holds no setting and fits under the cut with delegation ${isOn ? 'ON' : 'OFF'}, the longest name and persona`, async ($, on) => {
    const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
    const vibe = Object.keys(VIBES).reduce((a, b) => (VIBES[b]!.prompt.length > VIBES[a]!.prompt.length ? b : a))
    // A name longer than any the look keeps.
    const look = { ...DEFAULT_LOOK, name: 'N'.repeat(24), vibe }
    engine(on, { seen, stored: { look, isOn } })
    await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
    expect(seen.tools).toHaveLength(1)
    expect(seen.tools[0]).toBe(DELEGATE_SPEC.description)
    expect(seen.tools[0]).toMatch(/mcp__crew__delegate calls in one message/)
    expect(seen.tools[0]).not.toMatch(/N{24}|Persona:|delegation was/)
    expect(seen.tools[0]!.includes(VIBES[vibe]!.prompt)).toBe(false)
    // Claude Code cuts a tool description at 4096 characters.
    expect(seen.tools[0]!.length).toBeLessThanOrEqual(3950)
  })
}

test('switching the mode or the name leaves the brief and the delegate tool as they were', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
  engine(on, { seen })
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const before = (await composeBrief($))?.text
  expect(before).toMatch(/\nCrew: delegation was ON when this brief was written/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'mode' })
  expect((await composeBrief($))?.text).toBe(before)
  await ui.press({ key: 'mode' })
  await ui.unmount()
  await crewCommand($, 'mode off')
  await crewCommand($, `import ${lookCode({ ...DEFAULT_LOOK, name: 'Luna' })}`)
  expect((await composeBrief($))?.text).toBe(before)
  expect(seen.tools).toHaveLength(1)
})

// A reload starts the session again and keeps the atoms: a second session
// start in one test is that reload.
test('a reload after the settings changed keeps the brief and the delegate tool as they were', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
  engine(on, { seen })
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const before = (await composeBrief($))?.text
  await crewCommand($, 'mode off')
  await crewCommand($, `import ${lookCode({ ...DEFAULT_LOOK, name: 'Luna' })}`)

  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect((await composeBrief($))?.text).toBe(before)
  expect(before).toMatch(/\nCrew: delegation was ON when this brief was written/)
  expect(before).toMatch(/You are Nova/)
  expect(seen.tools).toHaveLength(2)
  expect(seen.tools[1]).toBe(seen.tools[0])
})

test('the next message carries one "[crew]" note with the latest state, and the one after none', async ($, on) => {
  engine(on)
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: COMPOSER })

  await submit('Hola')
  expect(contexts[0]).toBeUndefined()
  await crewCommand($, 'mode off')
  await crewCommand($, `import ${lookCode({ ...DEFAULT_LOOK, name: 'Luna', vibe: 'pirate' })}`)
  expect((await submit('Arregla el login')).text).toBe('Arregla el login')
  expect(contexts[1]).toHaveLength(1)
  expect(contexts[1]![0]).toBe(
    '[crew] The user changed the crew settings. Delegation is OFF: do the work yourself; use the crew only when the user asks. ' +
      'You are Luna. Persona: Luna is a jolly pirate captain (a light "arr" now and then, never in code or technical text). ' +
      'Let it color greetings and short status lines only; technical content stays precise and plain.',
  )
  await submit('Y los tests')
  expect(contexts[2]).toBeUndefined()

  // A switch to the mode it already has says nothing; back on, it does.
  await crewCommand($, 'mode off')
  await submit('Sigue')
  expect(contexts[3]).toBeUndefined()
  await crewCommand($, 'mode on')
  await submit('Reparte')
  expect(contexts[4]![0]).toMatch(
    /^\[crew\] The user changed the crew settings\. Delegation is ON: you orchestrate, by the rules in mcp__crew__delegate's description\. You are Luna\./,
  )
})

test('settings changed after the last note went out are told with the first message of the next load', async ($, on) => {
  const { contexts, submit } = await startTold($, on, { 'sess-1': NOVA_ON }, false)
  await submit('Hola')
  await submit('Sigue')
  expect(contexts[0]).toHaveLength(1)
  expect(contexts[0]![0]).toMatch(/^\[crew\] The user changed the crew settings\. Delegation is OFF: do the work yourself; .* You are Nova\./)
  expect(contexts[1]).toBeUndefined()
  // The note sent is now the last one told: another load says nothing.
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await submit('Otra vez')
  expect(contexts[2]).toBeUndefined()
})

test('settings that match the last note sent are not told again', async ($, on) => {
  const { contexts, submit } = await startTold($, on, { 'sess-1': NOVA_ON }, true)
  await submit('Hola')
  expect(contexts).toEqual([undefined])
})

test('each conversation is told against its own last note', async ($, on) => {
  // A got OFF last, then B got ON: back in A, ON is news.
  const id = { now: 'sess-A' }
  const { contexts, submit } = await startTold($, on, { 'sess-A': NOVA_OFF, 'sess-B': NOVA_ON }, true, id)
  await submit('Hola')
  expect(contexts[0]![0]).toMatch(/^\[crew\] The user changed the crew settings\. Delegation is ON/)
  // A new conversation reads a brief that already says ON: no note.
  id.now = 'sess-C'
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await submit('Empezamos')
  expect(contexts[1]).toBeUndefined()
  // After a /clear (another id, no new load) the brief still says ON: OFF is news.
  await crewCommand($, 'mode off')
  await submit('Sin equipo')
  expect(contexts[2]![0]).toMatch(/Delegation is OFF/)
  id.now = 'sess-D'
  await submit('Otra conversación')
  expect(contexts[3]![0]).toMatch(/Delegation is OFF/)
  await submit('Sigue')
  expect(contexts[4]).toBeUndefined()
})
