// Which surface draws what of the conversation's crew rows: bubbles on the
// terminal, one-line cards the desktop app and VS Code open on a press, and
// the engine's own rows on the phone. The kit checks each tree against that
// surface's table and acts on it; it paints nothing.
import { expect } from 'claude-code/testing'
import type { Mounted, TestBody } from 'claude-code/testing'
import { accentHex } from '../src/figure/accent'
import { RED } from '../src/figure/anim'
import { DEFAULT_LOOK } from '../src/figure/look'
import { started } from '../src/prompts/results'
import { hash } from '../src/util/random'
import { DELEGATE, SURFACES, engine, frameRows, isBlank, test, toolRow } from './support/crew'
import type { Result, Row, Said } from './support/crew'

const CARD_SURFACES = ['desktop', 'vscode'] as const
type Surface = (typeof SURFACES)[number]
type Dollar = Parameters<TestBody>[0]

const WIDE = { columns: 100, rows: 40 }

const mountCall = ($: Dollar, surface: Surface, props: Row, viewport: { columns: number; rows: number } | undefined = WIDE) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'ToolUse', requestId: props.tool_use_id, props, ...(viewport !== undefined ? { viewport } : {}) })
const mountSaidOn = ($: Dollar, surface: Surface, id: string, props: Said, viewport = WIDE) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'UserMessage', requestId: id, props, viewport })
const mountResultOn = ($: Dollar, surface: Surface, props: Result) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'ToolResult', requestId: props.tool_use_id, props })

// What these tests read and act on of a drawing, whichever component it is.
type Drawn = Pick<Mounted<Surface>, 'find' | 'findAll' | 'press'> & { redraw: () => Promise<void> }

// A card's one line: its figure beside its text, nothing under them, and
// nothing of a bubble's frame.
async function cardOf(ui: Drawn) {
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect(await frameRows(ui)).toEqual([])
  return { svg: svg! }
}

// The Text that holds the whole line, which the pieces make up.
const lineMatches = async (ui: Drawn, line: RegExp) => expect(await ui.find({ type: 'Text', text: line })).toBeDefined()

// The press opens `whole` under the line and closes it again, each with its
// own glyph and name. No redraw is asked for: the card reads what a press writes.
async function opensTo(ui: Drawn, id: string, whole: string) {
  expect((await ui.findAll({ type: 'Button' })).map(b => [b.key, b.text, b.props.label])).toEqual([[`${id}:more`, '▸', 'Show all']])
  await ui.press({ key: `${id}:more` })
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(whole)
  expect((await ui.findAll({ type: 'Button' })).map(b => [b.key, b.text, b.props.label])).toEqual([[`${id}:less`, '▴', 'Show less']])
  await ui.press({ key: `${id}:less` })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect((await ui.find({ type: 'Button' }))?.key).toBe(`${id}:more`)
}

const REPORT = 'Tests verdes: 42 ok.\n\n- Cambié src/app.ts\n- Añadí un test\n- Nada pendiente'
const TASK = 'Run the tests and fix what fails.\nThe suite lives in api/.\nThird line.'

test('the terminal keeps its own ctrl+o, which says nothing of a card', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const input = { task: TASK, title: 'Arreglar tests', repo: '/work/api' }
  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_o1', ...input })).result)
  const asked = { tool: DELEGATE, tool_use_id: 'toolu_o1', output, isErrored: false, isExpanded: true }
  const terminal = await mountResultOn($, 'terminal', asked)
  expect((await terminal.drawn()).type).toBe('engine')
  await terminal.unmount()
  for (const surface of CARD_SURFACES) {
    const blank = await mountResultOn($, surface, asked)
    expect(await isBlank(blank)).toBe(true)
    await blank.unmount()
  }
})

for (const surface of CARD_SURFACES) {
  test(`on ${surface} a delegate call is a one-line card with the figure, and a press opens the task whole`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    const input = { task: TASK, title: 'Arreglar tests', repo: '/work/api' }
    // Drawn before the call reaches the crew: the engine's own row.
    const ui = await mountCall($, surface, toolRow(DELEGATE, 'toolu_d1', input, { isRunning: true }))
    expect((await ui.drawn()).type).toBe('engine')

    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_d1', ...input })).result)
    await ui.redraw(toolRow(DELEGATE, 'toolu_d1', input, { output }))
    const { svg } = await cardOf(ui)
    await lineMatches(ui, /^Nova → Pip · Arreglar tests · new$/)
    // The figure and the names in the colors the terminal's bubble gives them.
    const accent = accentHex({ seed: hash('agent-1') }, DEFAULT_LOOK)
    expect(String(svg.props.source)).toContain(`stroke="${accent}"`)
    expect(svg.props.alt).toBe('Pip')
    expect((await ui.find({ type: 'Text', text: /^Nova$/ }))?.props.color).toBe('claude')
    const pip = (await ui.find({ type: 'Text', text: /^Pip$/ }))?.props.color
    expect(pip).not.toBe('claude')
    expect((await ui.find({ type: 'Text', text: /^▸$/ }))?.props.color).toBe(pip)
    await opensTo(ui, 'toolu_d1', TASK)

    // The result is in the card: the block under it draws nothing.
    const result = await mountResultOn($, surface, { tool: DELEGATE, tool_use_id: 'toolu_d1', output, isErrored: false })
    expect(await isBlank(result)).toBe(true)
    await result.unmount()
    await ui.unmount()

    // Running, its worker not known yet: the crew, in no color of its own, and
    // its figure grey.
    const unknown = { task: 'Más tests', worker: 'nadie' }
    await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_d2', ...unknown })
    const running = await mountCall($, surface, toolRow(DELEGATE, 'toolu_d2', unknown, { isRunning: true }))
    await lineMatches(running, /^Nova → crew · Más tests$/)
    expect((await running.find({ type: 'Svg' }))?.props.alt).toBe('crew')
    expect(String((await running.find({ type: 'Svg' }))?.props.source)).toContain('stroke="#90a4ae"')
    expect(await running.find({ type: 'Button' })).toBeUndefined()
    // One that reached nobody keeps the engine's.
    await running.redraw(toolRow(DELEGATE, 'toolu_d2', unknown, { output: 'crew: no worker "nadie".' }))
    expect((await running.drawn()).type).toBe('engine')
    await running.unmount()
  })

  test(`on ${surface} a SendMessage is a card, and a stop one line with nothing to open`, async ($, on) => {
    let spawned = 0
    engine(on, { nextId: () => `agent-${++spawned}` })
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })

    const message = 'Mira también el login.\nY el registro.'
    const input = { to: 'pip', summary: 'Pregunta sobre el login', message }
    const output = { message: 'Message sent to pip', success: true }
    await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s1', ...input })
    const ui = await mountCall($, surface, toolRow('SendMessage', 'toolu_s1', input, { output }))
    await cardOf(ui)
    await lineMatches(ui, /^Nova → Pip · Pregunta sobre el login · delivered$/)
    await opensTo(ui, 'toolu_s1', message)
    const result = await mountResultOn($, surface, { tool: 'SendMessage', tool_use_id: 'toolu_s1', output, isErrored: false })
    expect(await isBlank(result)).toBe(true)
    await result.unmount()
    await ui.unmount()

    // With no summary its line takes the message; one that fits needs no press.
    const short = { to: 'pip', message: 'Una línea' }
    await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s2', ...short })
    const fits = await mountCall($, surface, toolRow('SendMessage', 'toolu_s2', short))
    await lineMatches(fits, /^Nova → Pip · Una línea$/)
    expect(await fits.find({ type: 'Button' })).toBeUndefined()
    await fits.unmount()

    const stop = { task_id: 'agent-1' }
    await $.tool.call({ tool: 'TaskStop', tool_use_id: 'toolu_x1', ...stop })
    const stopped = await mountCall($, surface, toolRow('TaskStop', 'toolu_x1', stop, { output: { task_id: 'agent-1', task_type: 'local_agent' } }))
    await cardOf(stopped)
    await lineMatches(stopped, /^Nova × Pip$/)
    expect((await stopped.find({ type: 'Text', text: /^ × $/ }))?.props.color).toBe('error')
    expect(await stopped.find({ type: 'Button' })).toBeUndefined()
    await stopped.unmount()
  })

  test(`on ${surface} a worker's report is a one-line card, and a press opens it whole, line breaks and all`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })

    const said: Said = { text: REPORT, origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } }
    const ui = await mountSaidOn($, surface, 'm1', said)
    await cardOf(ui)
    await lineMatches(ui, /^Pip → Nova · Tests verdes: 42 ok\. - Cambié src\/app\.ts - Añadí un test - Nada pend.*…$/)
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Pip')
    await opensTo(ui, 'm1', REPORT)

    // A surface with no ctrl+o may call every row expanded: the card stays one line.
    await ui.redraw({ ...said, isExpanded: true })
    await cardOf(ui)
    await ui.press({ key: 'm1:more' })
    await ui.redraw({ ...said, isExpanded: true })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(REPORT)
    await ui.unmount()

    // A report the line holds whole has nothing to open.
    const short = await mountSaidOn($, surface, 'm2', { ...said, text: 'Tests verdes: 42 ok.' })
    await lineMatches(short, /^Pip → Nova · Tests verdes: 42 ok\.$/)
    expect(await short.find({ type: 'Button' })).toBeUndefined()
    await short.unmount()
  })

  test(`on ${surface} an end notice is a one-line card with how it ended, and a press opens a long task whole`, async ($, on) => {
    let spawned = 0
    engine(on, { nextId: () => `agent-${++spawned}` })
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Arreglar tests', repo: '/work/api' })

    const ended = (id: string, status: string, durationMs?: number): Said => ({
      text: 'Agent "Arreglar tests" completed',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id, status, ...(durationMs !== undefined ? { durationMs } : {}) },
    })
    const ui = await mountSaidOn($, surface, 'end-1', ended('agent-1', 'completed', 125_000))
    const { svg } = await cardOf(ui)
    await lineMatches(ui, /^Pip → Nova · ✓ done · 2m 5s · Arreglar tests$/)
    expect((await ui.find({ type: 'Text', text: /^✓ done$/ }))?.props.color).toBe('success')
    // Its figure shows the end too, the engine's words nowhere.
    expect(String(svg.props.source)).toContain('✓')
    expect(await ui.find({ text: /Agent "/ })).toBeUndefined()
    // The title fits: nothing to open.
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()

    // Too long for its line, a press opens it.
    const long = 'Un título larguísimo para el aviso de que el worker ha terminado su trabajo de hoy y de mañana también'
    await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: long, message: 'x' })
    const cut = await mountSaidOn($, surface, 'end-2', ended('agent-1', 'failed'))
    await lineMatches(cut, /^Pip → Nova · × failed · Un título.*…$/)
    expect(String((await cut.find({ type: 'Svg' }))?.props.source)).toContain(`stroke="#${RED.toString(16)}"`)
    expect((await cut.find({ type: 'Text', text: /^× failed$/ }))?.props.color).toBe('error')
    await opensTo(cut, 'end-2', long)
    expect((await cut.find({ type: 'Text', text: /^▸$/ }))?.props.color).toBe('warning')
    await cut.unmount()
  })

  test(`on ${surface} a card keeps to one line at any width, the title giving way first`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    const input = { task: 'x'.repeat(300), title: 'Un título bastante largo para esta tarea de hoy', repo: '/work/api' }
    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_w1', ...input })).result)
    const narrow = await mountCall($, surface, toolRow(DELEGATE, 'toolu_w1', input, { output }), { columns: 40, rows: 40 })
    const line = (await narrow.find({ type: 'Text', text: /^Nova → Pip/ }))?.text ?? ''
    expect(line).toBe('Nova → Pip · Un t… · new')
    expect(line.length).toBeLessThanOrEqual(24)
    await narrow.unmount()
    // A surface that has not measured still gets a line.
    const unmeasured = await mountCall($, surface, toolRow(DELEGATE, 'toolu_w1', input, { output }), undefined)
    await lineMatches(unmeasured, /^Nova → Pip · Un título bastante largo para esta tarea de hoy · new$/)
    await unmeasured.unmount()
  })

  test(`on ${surface} a row after a resume draws its card from what the row says`, async ($, on) => {
    engine(on)
    // Nothing of this conversation in the state: Claude Code restarted.
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })

    const input = { task: TASK, title: 'Arreglar tests', repo: '/work/api' }
    const call = await mountCall($, surface, toolRow(DELEGATE, 'toolu_r1', input, { output: started('Pip', 'pip', 'agent-7', '/work/api', '') }))
    const { svg } = await cardOf(call)
    await lineMatches(call, /^Nova → Pip · Arreglar tests · new$/)
    await opensTo(call, 'toolu_r1', TASK)
    expect(String(svg.props.source)).toContain(accentHex({ seed: hash('agent-7') }, DEFAULT_LOOK))
    const result = await mountResultOn($, surface, { tool: DELEGATE, tool_use_id: 'toolu_r1', output: started('Pip', 'pip', 'agent-7', '/work/api', ''), isErrored: false })
    expect(await isBlank(result)).toBe(true)
    await result.unmount()
    await call.unmount()

    // A worker's message gives its name but not the id its color comes from: grey.
    const back = await mountSaidOn($, surface, 'r-m1', { text: REPORT, origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } })
    await lineMatches(back, /^Pip → Nova · Tests verdes: 42 ok\./)
    expect((await back.find({ type: 'Text', text: /^Pip$/ }))?.props.color).toBe('inactive')
    expect(String((await back.find({ type: 'Svg' }))?.props.source)).toContain('stroke="#90a4ae"')
    await opensTo(back, 'r-m1', REPORT)
    await back.unmount()

    // An end notice gives the agent's id, how it ended and how long it ran; no
    // name, no title, so nothing to open, and never the engine's words.
    const note = await mountSaidOn($, surface, 'r-m2', {
      text: 'Agent "Arreglar tests" completed',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 'agent-7', status: 'completed', durationMs: 125_000 },
    })
    await lineMatches(note, /^crew → Nova · ✓ done · 2m 5s$/)
    expect((await note.find({ type: 'Svg' }))?.props.alt).toBe('crew')
    expect(String((await note.find({ type: 'Svg' }))?.props.source)).not.toContain('stroke="#90a4ae"')
    expect(await note.find({ type: 'Button' })).toBeUndefined()
    expect(await note.find({ text: /Arreglar/ })).toBeUndefined()
    await note.unmount()

    // A sender no worker could be and a shell's end keep the engine's row.
    for (const props of [
      { text: 'Hola', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'otra-sesion' } },
      { text: 'Background command "npm test" completed', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'b1x2', status: 'completed' } },
    ] as const) {
      const ui = await mountSaidOn($, surface, 'r-m3', props)
      expect((await ui.drawn()).type).toBe('engine')
      await ui.unmount()
    }
  })

  test(`on ${surface} an error and anything the crew cannot place keep the engine's row`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    const input = { task: TASK, title: 'Arreglar tests', repo: '/work/api' }
    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_e1', ...input })).result)

    const ui = await mountCall($, surface, toolRow(DELEGATE, 'toolu_e1', input, { output: 'boom', isErrored: true }))
    expect((await ui.drawn()).type).toBe('engine')
    await ui.redraw(toolRow(DELEGATE, 'toolu_e1', input, { output, isInterrupted: true }))
    expect((await ui.drawn()).type).toBe('engine')
    await ui.unmount()
    const result = await mountResultOn($, surface, { tool: DELEGATE, tool_use_id: 'toolu_e1', output: 'boom', isErrored: true })
    expect((await result.drawn()).type).toBe('engine')
    // One whose result it cannot read keeps its text too.
    await result.redraw({ tool: DELEGATE, tool_use_id: 'toolu_e1', output: 'in no shape the crew knows', isErrored: false })
    expect((await result.drawn()).type).toBe('engine')
    await result.unmount()

    // Someone else's call, and the person's own words.
    await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_e2', to: 'stranger', message: 'Hola' })
    const other = await mountCall($, surface, toolRow('SendMessage', 'toolu_e2', { to: 'stranger', message: 'Hola' }, { output: { success: true, message: 'ok' } }))
    expect((await other.drawn()).type).toBe('engine')
    await other.unmount()
    const own = await mountSaidOn($, surface, 'e-m1', { text: 'Hola', origin: { kind: 'composer' }, isExpanded: false })
    expect((await own.drawn()).type).toBe('engine')
    await own.unmount()

    // A hook that fails drawing, on a row it cannot read.
    const broken = await mountSaidOn($, surface, 'e-m2', { origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } } as unknown as Said)
    expect((await broken.drawn()).type).toBe('engine')
    await broken.unmount()
  })
}

// The same four rows on every surface: each draws them its own way.
for (const surface of SURFACES) {
  test(`what ${surface} draws of the crew's rows`, async ($, on) => {
    let spawned = 0
    engine(on, { nextId: () => `agent-${++spawned}` })
    await $.session.start({ cwd: '/work/main', surface, isInteractive: true })
    const task = { task: TASK, title: 'Arreglar tests', repo: '/work/api' }
    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_a1', ...task })).result)
    const send = { to: 'pip', summary: 'Pregunta', message: 'Mira también el login.\nY el registro.' }
    const sent = { message: 'Message sent to pip', success: true }
    await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_a2', ...send })
    const rows = [
      await mountCall($, surface, toolRow(DELEGATE, 'toolu_a1', task, { output })),
      await mountCall($, surface, toolRow('SendMessage', 'toolu_a2', send, { output: sent })),
      await mountSaidOn($, surface, 'a-m1', { text: REPORT, origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } }),
      await mountSaidOn($, surface, 'a-m2', {
        text: 'Agent "Arreglar tests" completed',
        origin: { kind: 'task-notification' },
        isExpanded: false,
        task: { id: 'agent-1', status: 'completed', durationMs: 4_000 },
      }),
    ]
    const results = [
      await mountResultOn($, surface, { tool: DELEGATE, tool_use_id: 'toolu_a1', output, isErrored: false }),
      await mountResultOn($, surface, { tool: 'SendMessage', tool_use_id: 'toolu_a2', output: sent, isErrored: false }),
    ]

    if (surface === 'mobile') {
      for (const ui of [...rows, ...results]) expect((await ui.drawn()).type).toBe('engine')
      return
    }
    for (const result of results) expect(await isBlank(result)).toBe(true)
    if (surface === 'terminal') {
      const framed = await Promise.all(rows.map(ui => frameRows(ui)))
      expect(framed.map(x => x[0])).toEqual([
        expect.stringMatching(/^╭─ Nova → Pip · Arreglar tests ─+╮$/),
        expect.stringMatching(/^╭─ Nova → Pip · Pregunta ─+╮$/),
        expect.stringMatching(/^╭─ Pip → Nova ─+╮$/),
        expect.stringMatching(/^╭─ Pip → Nova · ✓ done · 4s ─+╮$/),
      ])
      for (const ui of rows) expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      return
    }
    for (const ui of rows) await cardOf(ui)
    await lineMatches(rows[0]!, /^Nova → Pip · Arreglar tests · new$/)
    await lineMatches(rows[1]!, /^Nova → Pip · Pregunta · delivered$/)
    await lineMatches(rows[2]!, /^Pip → Nova · Tests verdes: 42 ok\./)
    await lineMatches(rows[3]!, /^Pip → Nova · ✓ done · 4s · Pregunta$/)
  })
}

test('a text the surface refuses keeps the engine\'s row', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })
  const ui = await mountSaidOn($, 'desktop', 'bad', { text: 'Salida: \u001b[31mrojo\u001b[0m', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } })
  expect((await ui.drawn()).type).toBe('engine')
  await ui.unmount()
})
