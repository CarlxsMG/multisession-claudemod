import { expect } from 'claude-code/testing'
import { nameColorOf } from '../src/figure/accent'
import { DEFAULT_LOOK } from '../src/figure/look'
import { parseMoodLines, pickLine } from '../src/persona/lines'
import { PANE, SLOW, WRITTEN, engine, spawnAgent, test } from './support/crew'

test('messages type out in bubbles, one after another', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__crew__delegate',
    task: 'Run the tests and fix what fails',
    title: 'Arreglar tests',
    repo: '/work/api',
  })
  await $.turn.complete({
    answer: 'Tests verdes: 42 ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    agentId: 'agent-1',
    reason: 'answer',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Arreglar tests\s*$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Tests verdes/ })).toBeUndefined()

  await clock.advance(300)
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: /^Arreglar t\S*▌\s*$/ }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Tests verdes/ })).toBeUndefined()

  // The worker's report waits for the brief to finish typing, then types out.
  await clock.advance(5000)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^Arreglar tests\s*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Tests verdes: 42 ok\s*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▌/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^╭─ Nova → Pip · \S+ ─+╮$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^╭─ Pip → Nova · \S+ ─+╮$/ })).toBeDefined()
  await ui.unmount()
})

test('the person\'s own messages are one quiet line, not a bubble', async ($, on) => {
  const clock = engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'Arregla los tests del login, porfa', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // A dash first, so `you` lines up with the names in the bubbles' borders.
  expect((await ui.find({ type: 'Text', text: /^ ─ you → Nova · / }))?.text).toMatch(/“Arregla los tests del login, porfa”$/)
  expect((await ui.find({ type: 'Text', text: /^you$/ }))?.props.color).toBe('suggestion')
  expect((await ui.find({ type: 'Text', text: /^ → $/ }))?.props.color).toBe('suggestion')
  expect(await ui.find({ type: 'Text', text: /^╭─ You/ })).toBeUndefined()
  await ui.unmount()
})

test('what the person pasted in the desktop app is marked as pasted, not shown in its tags', async ($, on) => {
  const clock = engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const text = 'Mira esto:\n<pasted_content id="071b">\nZod can exhaust memory\n</pasted_content>\ny arréglalo'
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const line = (await ui.find({ type: 'Text', text: /^ ─ you → Nova · / }))?.text
  expect(line).toMatch(/“Mira esto: \[pasted\] Zod can exhaust memory y arréglalo”$/)
  expect(line).not.toMatch(/pasted_content/)
  await ui.unmount()
})

test('the two newest messages are bubbles and older ones one line each', SLOW, async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'Repartid el trabajo', wait: false, origin: { kind: 'composer' } })
  for (let i = 1; i <= 3; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, title: `Tarea ${i}`, repo: `/work/r${i}` })
  }
  for (let i = 1; i <= 3; i++) {
    await $.turn.complete({ answer: `Informe ${i}`, durationMs: 1000, isAborted: false, turnId: `t${i}`, agentId: `agent-${i}`, reason: 'answer' })
  }
  await clock.advance(60_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 40 } } })
  const bubbles = (await ui.findAll({ type: 'Text', text: /^╭─ \S+ → / })).map(x => x.text)
  expect(bubbles).toHaveLength(2)
  expect(bubbles[0]).toMatch(/^╭─ Bolt → Nova/)
  expect(bubbles[1]).toMatch(/^╭─ Mika → Nova/)
  const lines = (await ui.findAll({ type: 'Text', text: /^ ─ \S+ → / })).map(x => x.text)
  expect(lines[0]).toMatch(/^ ─ you → Nova · .*“Repartid el trabajo”$/)
  expect(lines.filter(x => /^ ─ Nova → /.test(x))).toHaveLength(3)
  expect(lines.filter(x => /^ ─ Pip → Nova · .*“Informe 1”$/.test(x))).toHaveLength(1)
  expect(bubbles.length + lines.length).toBeGreaterThanOrEqual(6)
  // Every bubble sits on the left, whoever wrote it.
  const frame = await ui.find({ type: 'Box', text: /^╭─ Mika → Nova/ })
  expect(frame?.props.alignItems).toBe('flex-start')
  await ui.unmount()
})

test('Haiku writes lines once per personality, never while editing', SLOW, async ($, on) => {
  const clock = engine(on)
  const asked: string[] = []
  on('model.complete', (_, e) => {
    asked.push(e.model)
    return {
      value: {
        isAnswered: true as const,
        text: WRITTEN,
        usage: { input_tokens: 200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(asked).toEqual(['haiku'])

  // A new personality, chosen in the editor, is written for once the editor closes.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-persona' })
  await ui.press({ key: 'vibe-pirate' })
  await ui.press({ key: 'vibe-zen' })
  await clock.advance(30_000)
  expect(asked).toHaveLength(1)
  await ui.press({ key: 'look-done' })
  await clock.advance(30_000)
  expect(asked).toHaveLength(2)
  await ui.unmount()
})

test('written lines are kept only when they fit', () => {
  const moods = parseMoodLines(`Aquí van:\n${WRITTEN}\n¡Suerte!`)
  expect(moods?.delegating).toEqual(['{w}, ¡al lío!'])
  expect(moods?.happy).toEqual(['¡Clavado!'])
  expect(parseMoodLines('no JSON here')).toBeUndefined()
  expect(parseMoodLines('{"idle": [1, 2]}')).toBeUndefined()

  const l = { ...DEFAULT_LOOK, vibe: 'pirate' }
  const extra = moods ?? {}
  const line = pickLine(l, 'delegating', 5000, 6000, 'Pip', extra)
  expect(line).toContain('Pip')
  expect(line).not.toContain('{w}')
  // The same mood keeps its line for a while, and moves on later.
  expect(pickLine(l, 'working', 5000, 9000, 'Pip', extra)).toBe(pickLine(l, 'working', 5000, 20_000, 'Pip', extra))
  const seen = new Set([0, 1, 2, 3, 4, 5].map(k => pickLine(l, 'working', 5000, 5000 + k * 25_000, 'Pip', extra)))
  expect(seen.size).toBeGreaterThan(1)
})

test('a worker named like the orchestrator keeps its own color in the feed', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await spawnAgent($, { prompt: 'Run the tests', description: 'Tests', subagentType: 'general-purpose', name: 'nova', tool_use_id: 'toolu_1', background: false })
  await $.turn.complete({ answer: 'Tests verdes', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await clock.advance(10_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // The brief goes from the orchestrator to the worker, its report back.
  const heads = await ui.findAll({ type: 'Text', text: /^╭─ Nova → Nova · / })
  const names = heads.map(h => (h.children as { props: { bold?: boolean; color?: string } }[]).filter(c => c.props.bold === true).map(c => c.props.color))
  const orch = nameColorOf(DEFAULT_LOOK)
  const worker = names[0]?.[1]
  expect(worker).not.toBe(orch)
  expect(names).toEqual([[orch, worker], [worker, orch]])
  await ui.unmount()
})

test('someone outside the crew named like the orchestrator is drawn plain, not in its color', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.session.send({ to: 'Nova', text: 'Are you on the login page?', origin: { kind: 'model' } } as Parameters<typeof $.session.send>[0])
  await clock.advance(10_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const head = await ui.find({ type: 'Text', text: /^╭─ Nova → Nova · / })
  const names = (head?.children as { props: { bold?: boolean; color?: string } }[]).filter(c => c.props.bold === true).map(c => c.props.color)
  expect(names).toEqual([nameColorOf(DEFAULT_LOOK), 'text'])
  await ui.unmount()
})
