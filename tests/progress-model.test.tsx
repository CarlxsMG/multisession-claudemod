// The little of progress a model reads, and that nothing else of it reaches
// one.
import { expect, mock } from 'claude-code/testing'
import { COMPOSER, DELEGATE, crewCommand, engine, progress, progressCrew, spawnAgent, test } from './support/crew'

// In Spanish, so that no word of the UI's reads as the English the models
// are given: the check looks for the UI's words in what a model reads.
test('progress reaches no model: no prompt section, no message context, no message, no stored row', { options: { language: 'es' } }, async ($, on) => {
  const session = mock.session(on)
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  let invalidated = 0
  on('ui.invalidate', () => {
    invalidated++
    return { value: undefined }
  })
  const { clock, seen, statuses, placed, delegate, end } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  expect(await progress($, 'agent-1', 2, 3, 'Probar el login')).toBe('ok; next: step 3 of 3, as you start it.')
  await clock.advance(200_000)
  // The roster is read when the orchestrator calls it: an active worker's
  // step, and nothing more of its progress.
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster.match(/step \d+\/\d+/g)).toEqual(['step 2/3'])
  const reply = await crewCommand($, 'progreso')
  await end('agent-1')
  await end('agent-2')
  await clock.advance(2000)
  // Everything showed: the status line, a check-in, the asked one, the summary.
  expect(statuses.some(x => x !== undefined && /^crew · Pip 2\/3 /.test(x))).toBe(true)
  expect(placed).toHaveLength(3)

  const shown =
    /crew ·|ronda|activos?\b|aviso|llamadas?\b|pensando|leyendo|editando|ejecutando|probando|navegando|esperando|✓ listo|× falló|paso|% de los pasos|≈|más \(estimado\)|el plan creció|Probar el login|\d+\/\d+/
  const composed = await $.prompt.compose({
    model: 'test-model',
    promptModel: 'test-model',
    surfaces: ['terminal'],
    tools: ['mcp__crew__delegate'],
    outputStyle: null,
    traits: [],
  })
  expect(composed.sections.length).toBeGreaterThan(1)
  for (const s of composed.sections) expect(s.text).not.toMatch(shown)
  await $.prompt.submit({ text: 'Sigue', wait: false, origin: COMPOSER })
  expect(contexts).toEqual([undefined])
  expect(reply).toEqual({})
  expect(seen.sends).toEqual([])
  expect(session.appended()).toEqual([])
  expect(invalidated).toBe(0)
  expect(roster.replace(', step 2/3,', ',')).not.toMatch(shown)
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)).not.toMatch(shown)
})

// In Spanish, as the test above: the roster's own step is English, the UI's
// is not.
test("the roster gives an active worker's step, the one part of progress a model reads", { options: { language: 'es' } }, async ($, on) => {
  const { delegate, end } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await progress($, 'agent-1', 3, 5, 'Escribir tests')
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  const listed = await roster()
  expect(listed).toMatch(/^- Pip: address "pip", \w+, step 3\/5, repo \/work\/api, /m)
  expect(listed).toMatch(/^- Bolt: address "bolt", \w+, repo \/work\/web, /m)
  expect(listed).not.toMatch(/Escribir tests|paso|%|≈/)
  await end('agent-1')
  expect(await roster()).not.toMatch(/step/)
})

test('workers hear when to call progress, and forks do not', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Investigate the checkout', repo: '/work/shop' })
  expect(seen.prompts[0]).toMatch(
    /\n- 3\+ steps: call mcp__crew__progress as you start each step, 1 to N \(the N steps you will actually take\), in the same message as that step's first tool call\.\n- Stop and report instead of guessing when [^\n]*\n- In a git repository/,
  )
  expect(seen.prompts[0]).not.toMatch(/step 0/)
  await spawnAgent($, { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  await spawnAgent($, { prompt: 'Draft the plan', description: 'Plan', subagentType: 'fork', fork: true })
  expect(seen.prompts).toHaveLength(3)
  for (const prompt of seen.prompts.slice(1)) expect(prompt).not.toMatch(/progress/)
})

test('a first call at step 1 sets the plan, with no step 0 before it', async ($, on) => {
  const { delegate } = await progressCrew($, on)
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  expect(await progress($, 'agent-1', 1, 4, 'Leer')).toBe('ok; next: step 2 of 4, as you start it.')
  expect(await roster()).toMatch(/^- Pip: address "pip", \w+, step 1\/4, repo \/work\/api, /m)
  expect(await progress($, 'agent-1', 2, 4, 'Arreglar')).toBe('ok; next: step 3 of 4, as you start it.')
  expect(await roster()).toMatch(/^- Pip: address "pip", \w+, step 2\/4, repo \/work\/api, /m)
})

test('the progress tool answers a worker with the step it owes next, through the last', async ($, on) => {
  const { delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  expect(await progress($, 'agent-1', 0, 3, 'Plan')).toBe('ok; next: step 1 of 3, as you start it.')
  expect(await progress($, 'agent-1', 1, 3, 'Leer')).toBe('ok; next: step 2 of 3, as you start it.')
  expect(await progress($, 'agent-1', 3, 3, 'Publicar')).toBe('ok; last step.')
  // A step past the total stretches the plan to it: it is the last.
  expect(await progress($, 'agent-1', 5, 4, 'Uno más')).toBe('ok; last step.')
})
