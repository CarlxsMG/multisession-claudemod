import { expect } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'
import { CLICKS, DELEGATE, PANE, engine, frameRows, isBlank, mountResult, mountRow, mountSaid, spawnAgent, test, toolRow } from './support/crew'
import type { Said } from './support/crew'

test("the orchestrator's delegate row names the worker in the panel's color, once known", async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const input = { task: 'Run the tests and fix what fails.\nThe suite lives in api/.\nThird line.', title: 'Arreglar tests', repo: '/work/api' }
  // Drawn before the call reaches the crew: the engine's own row.
  const ui = await mountRow($, toolRow(DELEGATE, 'toolu_d1', input, { isRunning: true }))
  expect((await ui.drawn()).type).toBe('engine')

  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_d1', ...input })).result)
  expect(output).toMatch(/^Started Pip /)
  await ui.redraw(toolRow(DELEGATE, 'toolu_d1', input, { output }))
  expect(await ui.find({ type: 'Text', text: /^╭─ Nova → Pip · Arreglar tests ─+╮$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^╰─ new ─+╯$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^│ Run the tests and fix what fails\. +│$/ })).toBeDefined()
  expect(await ui.find({ text: /^│ The suite lives in api\/\.… +│$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Third line/ })).toBeUndefined()
  // As wide as its text, every row the same.
  const rows = await frameRows(ui)
  expect(rows).toHaveLength(4)
  expect(new Set(rows.map(r => r.length)).size).toBe(1)
  expect(rows[0]!.length).toBeLessThan(60)
  expect((await ui.find({ type: 'Text', text: /^Nova$/ }))?.props.color).toBe('claude')
  const color = (await ui.find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect((await ui.find({ type: 'Text', text: /^╭─ $/ }))?.props.color).toBe(color)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /^Pip$/ }))?.props.color).toBe(color)
  expect(color).not.toBe('claude')
  await pane.unmount()

  // The result is in the bubble: the block under it draws nothing.
  const result = await mountResult($, { tool: DELEGATE, tool_use_id: 'toolu_d1', output, isErrored: false })
  expect(await isBlank(result)).toBe(true)

  // ctrl+o shows the bubble whole and the engine's result under it; an error
  // keeps the engine's row and result.
  await ui.redraw(toolRow(DELEGATE, 'toolu_d1', input, { output, isExpanded: true }))
  expect(await ui.find({ type: 'Text', text: /^│ Third line\. +│$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await result.redraw({ tool: DELEGATE, tool_use_id: 'toolu_d1', output, isErrored: false, isExpanded: true })
  expect((await result.drawn()).type).toBe('engine')
  await ui.redraw(toolRow(DELEGATE, 'toolu_d1', input, { output: 'boom', isErrored: true }))
  expect((await ui.drawn()).type).toBe('engine')
  await result.redraw({ tool: DELEGATE, tool_use_id: 'toolu_d1', output: 'boom', isErrored: true })
  expect((await result.drawn()).type).toBe('engine')
  await result.unmount()
  await ui.unmount()
})

test('a delegate bubble says in its bottom border whether the worker is new or reused, and who else works there', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const call = async (id: string, input: Record<string, unknown>) => {
    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: id, ...input })).result)
    return { row: await mountRow($, toolRow(DELEGATE, id, input, { output })), output }
  }
  const done = (id: string) => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id, agentId: id, reason: 'answer' })

  const first = await call('toolu_h1', { task: 'Arregla el login', title: 'Login', repo: '/work/api' })
  expect(await first.row.find({ type: 'Text', text: /^╰─ new ─+╯$/ })).toBeDefined()

  // Pip is at work in the repository: its name, in its color.
  const second = await call('toolu_h2', { task: 'Arregla el checkout', title: 'Checkout', repo: '/work/api', fresh: true })
  expect(second.output).toMatch(/\nHeads-up: Pip is working in this repository/)
  expect(await second.row.find({ type: 'Text', text: /^╰─ new · ! Pip works here ─+╯$/ })).toBeDefined()
  const pipColor = (await first.row.find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect((await second.row.find({ type: 'Text', text: /^Pip$/ }))?.props.color).toBe(pipColor)
  const warn = await second.row.find({ type: 'Text', text: /^! $/ })
  expect(warn?.props).toMatchObject({ color: 'warning', bold: true })
  const rows = await frameRows(second.row)
  expect(new Set(rows.map(r => r.length)).size).toBe(1)
  const result = await mountResult($, { tool: DELEGATE, tool_use_id: 'toolu_h2', output: second.output, isErrored: false })
  expect(await isBlank(result)).toBe(true)
  await result.unmount()

  // Reused while Bolt works there: the long form where it fits; in a
  // narrower row it does not, and the short one does.
  await done('agent-1')
  const third = await call('toolu_h3', { task: 'Y el registro', title: 'Registro', repo: '/work/api' })
  expect(third.output).toMatch(/^Given to Pip /)
  expect(await third.row.find({ type: 'Text', text: /^╰─ reused · keeps its context · ! Bolt works here ─+╯$/ })).toBeDefined()
  await third.row.unmount()
  const narrow = await mountRow($, toolRow(DELEGATE, 'toolu_h3', { task: 'Y el registro', title: 'Registro', repo: '/work/api' }, { output: third.output }), { ...CLICKS, columns: 56 })
  expect(await narrow.find({ type: 'Text', text: /^╰─ reused · ! Bolt works here ─+╯$/ })).toBeDefined()
  await narrow.unmount()

  await done('agent-1')
  await done('agent-2')
  const fourth = await call('toolu_h4', { task: 'Revisa el checkout', title: 'Revisión', worker: 'bolt' })
  expect(await fourth.row.find({ type: 'Text', text: /^╰─ reused · keeps its context ─+╯$/ })).toBeDefined()

  // A result delegate did not write keeps the engine's text under the row.
  const odd = await mountResult($, { tool: DELEGATE, tool_use_id: 'toolu_h4', output: 'crew: something else', isErrored: false })
  expect((await odd.drawn()).type).toBe('engine')
  await odd.unmount()
})

test('a delegate row reads "→ crew" while it runs, and one that reached nobody keeps the engine\'s', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const input = { task: 'Más tests', worker: 'nadie' }
  await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_d2', ...input })
  const ui = await mountRow($, toolRow(DELEGATE, 'toolu_d2', input, { isRunning: true }))
  expect(await ui.find({ type: 'Text', text: /^╭─ Nova → crew · Más tests ─+╮$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^╭─ $/ }))?.props.color).toBe('inactive')
  await ui.redraw(toolRow(DELEGATE, 'toolu_d2', input, { output: 'crew: no worker "nadie".' }))
  expect((await ui.drawn()).type).toBe('engine')
  await ui.unmount()
})

test('the orchestrator\'s SendMessage and TaskStop to a worker are drawn in its color; anyone else\'s keep the engine\'s', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'A', repo: '/work/api', fresh: true })
  await $.tool.call({ tool: DELEGATE, task: 'B', repo: '/work/web', fresh: true })

  const ask = { to: 'pip [3fa9c1]', summary: 'Amplía el login', message: 'Añade también el caso de la contraseña caducada.\nY el de la cuenta bloqueada.' }
  await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s1', ...ask })
  const sent = await mountRow($, toolRow('SendMessage', 'toolu_s1', ask))
  expect(await sent.find({ type: 'Text', text: /^╭─ Nova → Pip · Amplía el login ─+╮$/ })).toBeDefined()
  expect(await sent.find({ type: 'Text', text: /^│ Añade también el caso de la contraseña caducada\. │$/ })).toBeDefined()
  expect(await sent.find({ type: 'Text', text: /^│ Y el de la cuenta bloqueada\. +│$/ })).toBeDefined()
  // What became of it, once it answered: delivered, or the worker woken.
  const woke = { success: true, message: 'Resuming agent pip', resumedAgentId: 'agent-1' }
  await sent.redraw(toolRow('SendMessage', 'toolu_s1', ask, { output: woke }))
  expect(await sent.find({ type: 'Text', text: /^╰─ wakes Pip ─+╯$/ })).toBeDefined()
  const result = await mountResult($, { tool: 'SendMessage', tool_use_id: 'toolu_s1', output: woke, isErrored: false })
  expect(await isBlank(result)).toBe(true)
  await sent.redraw(toolRow('SendMessage', 'toolu_s1', ask, { output: { success: true, message: "Message sent to pip's inbox" } }))
  expect(await sent.find({ type: 'Text', text: /^╰─ delivered ─+╯$/ })).toBeDefined()
  // One that did not arrive says nothing in the border, and its result shows.
  const lost = { success: false, message: 'No agent named pip is running' }
  await sent.redraw(toolRow('SendMessage', 'toolu_s1', ask, { output: lost }))
  expect(await sent.find({ type: 'Text', text: /^╰─+╯$/ })).toBeDefined()
  await result.redraw({ tool: 'SendMessage', tool_use_id: 'toolu_s1', output: lost, isErrored: false })
  expect((await result.drawn()).type).toBe('engine')
  await result.unmount()
  await sent.unmount()

  // Pip's own message to Bolt is a worker's row: the engine's.
  const aside = { to: 'bolt', message: 'Te paso el esquema' }
  await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s2', agentId: 'agent-1', ...aside })
  // A message to someone outside the crew.
  const away = { to: 'otra-sesion', message: 'Hola' }
  await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s3', ...away })
  for (const [id, input] of [['toolu_s2', aside], ['toolu_s3', away]] as const) {
    const ui = await mountRow($, toolRow('SendMessage', id, input))
    expect((await ui.drawn()).type).toBe('engine')
    await ui.unmount()
  }

  await $.tool.call({ tool: 'TaskStop', tool_use_id: 'toolu_t1', task_id: 'agent-2' })
  const stop = await mountRow($, toolRow('TaskStop', 'toolu_t1', { task_id: 'agent-2' }))
  expect(await stop.find({ type: 'Text', text: /^● Nova × Bolt$/ })).toBeDefined()
  expect((await stop.find({ type: 'Text', text: /^ × $/ }))?.props.color).toBe('error')
  await stop.unmount()
  const stopped = await mountResult($, { tool: 'TaskStop', tool_use_id: 'toolu_t1', output: { message: 'Stopped' }, isErrored: false })
  expect(await isBlank(stopped)).toBe(true)
  await stopped.redraw({ tool: 'TaskStop', tool_use_id: 'toolu_t1', output: 'No task agent-9', isErrored: true })
  expect((await stopped.drawn()).type).toBe('engine')
  await stopped.unmount()
})

test('a worker\'s report and hand-back come in its color, to whoever started it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Arreglar tests', repo: '/work/api' })

  const report = 'Tests verdes: 42 ok.\n\n- Cambié src/app.ts\n- Añadí un test\n- Nada pendiente'
  const back = await mountSaid($, 'm1', { text: report, origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } })
  expect(await back.find({ type: 'Text', text: /^╭─ Pip → Nova ─+╮$/ })).toBeDefined()
  expect(await back.find({ type: 'Text', text: /^│ Tests verdes: 42 ok\. +│$/ })).toBeDefined()
  expect(await back.find({ text: /^│ - Añadí un test… +│$/ })).toBeDefined()
  expect(await frameRows(back)).toHaveLength(5)
  // Framed in Pip's color.
  expect((await back.find({ type: 'Text', text: /^╭─ $/ }))?.props.color).toBe((await back.find({ type: 'Text', text: /^Pip$/ }))?.props.color)
  expect(await back.find({ type: 'Text', text: /Nada pendiente/ })).toBeUndefined()
  // ctrl+o shows it whole.
  await back.redraw({ text: report, origin: { kind: 'unclassified' }, isExpanded: true, from: { name: 'pip' } })
  expect(await back.find({ type: 'Text', text: /^│ - Nada pendiente +│$/ })).toBeDefined()
  await back.unmount()

  const note = await mountSaid($, 'm2', {
    text: 'Agent "Arreglar tests" completed',
    origin: { kind: 'task-notification' },
    isExpanded: false,
    task: { id: 'agent-1', status: 'completed', durationMs: 125_000 },
  })
  expect(await frameRows(note)).toEqual([
    expect.stringMatching(/^╭─ Pip → Nova · ✓ done · 2m 5s ─+╮$/),
    expect.stringMatching(/^│ Arreglar tests +│$/),
    expect.stringMatching(/^╰─+╯$/),
  ])
  await note.unmount()

  // The person's own words, a stranger's message and another task keep the engine's row.
  for (const props of [
    { text: 'Hola', origin: { kind: 'composer' }, isExpanded: false },
    { text: 'Hola', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'otra-sesion' } },
    { text: 'Background command finished', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'b1x2', status: 'completed' } },
  ] as const) {
    const ui = await mountSaid($, 'm3', props)
    expect((await ui.drawn()).type).toBe('engine')
    await ui.unmount()
  }

  // An agent Pip started reports to Pip; Pip's message to it says so too.
  await $.agent.spawn({ prompt: 'File the tickets', description: 'Tickets', subagentType: 'general-purpose', parentAgentId: 'agent-1' } as AgentSpawnInput)
  const nested = await mountSaid($, 'm4', { text: 'Agent "Tickets" completed', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'agent-2', status: 'completed' } })
  const pipColor = (await nested.find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect(await frameRows(nested)).toEqual([
    expect.stringMatching(/^╭─ Bolt → Pip · ✓ done ─+╮$/),
    expect.stringMatching(/^│ Tickets +│$/),
    expect.stringMatching(/^╰─+╯$/),
  ])
  expect(pipColor).not.toBe('claude')
  await nested.unmount()
  await $.session.send({ to: 'agent-2', text: 'Usa el proyecto SHOP', origin: { kind: 'model' }, agentId: 'agent-1' })
  const told = await mountSaid($, 'm5', { text: 'Usa el proyecto SHOP', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } })
  expect(await told.find({ type: 'Text', text: /^╭─ Pip → Bolt ─+╮$/ })).toBeDefined()
  await told.unmount()
})

test('a worker\'s end is a small bubble: how it ended above, the task it just did inside', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ended = (row: string, id: string, status?: string, durationMs?: number, columns?: number) =>
    $.ui.mount({
      plugin: 'crew',
      surface: 'terminal',
      component: 'UserMessage',
      requestId: row,
      props: {
        text: 'Agent "Primera tarea" finished',
        origin: { kind: 'task-notification' },
        isExpanded: false,
        task: { id, ...(status !== undefined ? { status } : {}), ...(durationMs !== undefined ? { durationMs } : {}) },
      },
      viewport: { ...CLICKS, columns: columns ?? CLICKS.columns },
    })
  // Its rows, all as wide: the top border, the title, the bottom border.
  const bubble = async (ui: Awaited<ReturnType<typeof ended>>, rows = 3) => {
    const drawn = await frameRows(ui)
    expect(drawn).toHaveLength(rows)
    expect(new Set(drawn.map(r => r.length)).size).toBe(1)
    expect(drawn[rows - 1]).toMatch(/^╰─+╯$/)
    return drawn
  }

  await $.tool.call({ tool: DELEGATE, task: 'Haz la primera tarea', title: 'Primera tarea', repo: '/work/api' })
  const first = await ended('end-1', 'agent-1', 'completed', 4_000)
  expect((await bubble(first)).slice(0, 2)).toEqual([expect.stringMatching(/^╭─ Pip → Nova · ✓ done · 4s ─+╮$/), expect.stringMatching(/^│ Primera tarea +│$/)])
  expect((await first.find({ type: 'Text', text: /^✓ done$/ }))?.props.color).toBe('success')
  const pipColor = (await first.find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect((await first.find({ type: 'Text', text: /^╭─ $/ }))?.props.color).toBe(pipColor)
  expect(await first.find({ type: 'Text', text: /Agent "/ })).toBeUndefined()

  // Reused with a new title: the next end names it, the one drawn before keeps
  // its own. A failure is framed in the warning color.
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await $.tool.call({ tool: DELEGATE, task: 'Ahora el borde', title: 'Prueba borde: reutilizado', repo: '/work/api' })
  const second = await ended('end-2', 'agent-1', 'failed', 2_000)
  expect((await bubble(second)).slice(0, 2)).toEqual([expect.stringMatching(/^╭─ Pip → Nova · × failed · 2s ─+╮$/), expect.stringMatching(/^│ Prueba borde: reutilizado +│$/)])
  expect((await second.find({ type: 'Text', text: /^╭─ $/ }))?.props.color).toBe('warning')
  expect((await second.find({ type: 'Text', text: /^× failed$/ }))?.props.color).toBe('error')
  await first.redraw()
  expect((await bubble(first))[1]).toMatch(/^│ Primera tarea +│$/)

  // A message given last names it by its summary, or its first line.
  await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: 'Pregunta sobre el brief', message: '¿Qué recortarías?' })
  expect((await bubble(await ended('end-3', 'agent-1', 'killed'))).slice(0, 2)).toEqual([
    expect.stringMatching(/^╭─ Pip → Nova · ■ stopped ─+╮$/),
    expect.stringMatching(/^│ Pregunta sobre el brief +│$/),
  ])
  await $.tool.call({ tool: 'SendMessage', to: 'pip', message: '\nMira el login.\nY el registro.' })
  expect((await bubble(await ended('end-4', 'agent-1', 'completed')))[1]).toMatch(/^│ Mira el login\. +│$/)
  // Another word comes as it was.
  expect((await bubble(await ended('end-5', 'agent-1', 'timeout')))[0]).toMatch(/^╭─ Pip → Nova · timeout ─+╮$/)

  // Cut to the row, never wrapped.
  await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: 'Un resumen muy largo que en una terminal estrecha no cabe en la línea', message: 'Detalle' })
  const narrow = await bubble(await ended('end-6', 'agent-1', 'completed', 61_000, 40))
  expect(narrow[0]).toMatch(/^╭─ Pip → Nova · ✓ done · 1m 1s ─+╮$/)
  expect(narrow[1]).toMatch(/^│ Un resumen.*…\s*│$/)
  expect(narrow[0]!.length).toBeLessThanOrEqual(34)

  // An agent nobody gave anything to: just the two borders, never the engine's words.
  await spawnAgent($, { prompt: '', description: '', subagentType: 'general-purpose' })
  expect((await bubble(await ended('end-7', 'agent-2', 'completed'), 2))[0]).toMatch(/^╭─ Bolt → Nova · ✓ done ─+╮$/)
})

test('on a narrow terminal a bubble takes the row and never overflows it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const input = { task: 'Revisa el flujo de pago entero y dime qué falla cuando la tarjeta caduca a mitad de compra.', title: 'Un título bastante largo que no cabe entero', repo: '/work/api' }
  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_n1', ...input })).result)
  const ui = await $.ui.mount({
    plugin: 'crew',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'toolu_n1',
    props: toolRow(DELEGATE, 'toolu_n1', input, { output }),
    viewport: { columns: 40, rows: 30, isFullscreen: true },
  })
  const rows = await frameRows(ui)
  expect(rows).toHaveLength(4)
  expect(new Set(rows.map(r => r.length)).size).toBe(1)
  expect(rows[0]!.length).toBeLessThanOrEqual(34)
  expect(rows[0]).toMatch(/^╭─ Nova → Pip · Un título.*…/)
  expect(rows[2]).toMatch(/…\s+│$/)
  expect(rows[3]).toMatch(/^╰─ new ─+╯$/)
  await ui.unmount()
})

test('a cut bubble opens whole on a click and closes on another; where nothing reports clicks it is whole', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const input = { task: 'Línea uno.\nLínea dos.\nLínea tres.\nLínea cuatro.', title: 'Largo', repo: '/work/api' }
  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_c1', ...input })).result)
  const props = toolRow(DELEGATE, 'toolu_c1', input, { output })

  const row = await mountRow($, props)
  expect(await frameRows(row)).toHaveLength(4)
  expect(await row.find({ text: /^│ Línea dos\.… +│$/ })).toBeDefined()
  // Its "…" alone is the press, in the bubble's color: the pointer inverts
  // that one cell and nothing else.
  const more = await row.findAll({ type: 'Button' })
  expect(more.map(b => [b.key, b.text, b.props.label])).toEqual([['toolu_c1:more', '…', 'Show all']])
  const pipColor = (await row.find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect((await row.find({ type: 'Text', text: /^…$/ }))?.props.color).toBe(pipColor)
  await row.press({ key: 'toolu_c1:more' })
  await row.redraw()
  const opened = await frameRows(row)
  expect(opened).toHaveLength(6)
  expect(new Set(opened.map(r => r.length)).size).toBe(1)
  expect(await row.find({ type: 'Text', text: /^│ Línea cuatro\. +│$/ })).toBeDefined()
  // Opened, a "▴" at the end of the bottom border closes it.
  expect(opened[5]).toMatch(/^╰─ new ─+▴─╯$/)
  expect((await row.findAll({ type: 'Button' })).map(b => [b.key, b.text, b.props.label])).toEqual([['toolu_c1:less', '▴', 'Show less']])
  await row.press({ key: 'toolu_c1:less' })
  await row.redraw()
  expect(await frameRows(row)).toHaveLength(4)
  await row.unmount()

  // The terminal's main screen reports no clicks: the bubble is whole, and no press.
  const plain = await mountRow($, props, { columns: 80, rows: 40 })
  expect(await frameRows(plain)).toHaveLength(6)
  expect(await plain.find({ type: 'Button' })).toBeUndefined()
  await plain.unmount()

  // A text that fits needs no press.
  const short = { to: 'pip', message: 'Una línea' }
  await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_c2', ...short })
  const fits = await mountRow($, toolRow('SendMessage', 'toolu_c2', short))
  expect(await frameRows(fits)).toHaveLength(3)
  expect(await fits.find({ type: 'Button' })).toBeUndefined()
  await fits.unmount()

  // A long report, and a long title in an end notice: cut where a click opens them, whole elsewhere.
  const report = Array.from({ length: 6 }, (_, i) => `Punto ${i + 1}.`).join('\n')
  const said: Said = { text: report, origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } }
  const back = await mountSaid($, 'c-back', said)
  expect(await frameRows(back)).toHaveLength(5)
  await back.press({ key: 'c-back:more' })
  await back.redraw()
  const report8 = await frameRows(back)
  expect(report8).toHaveLength(8)
  expect(report8[7]).toMatch(/^╰─+▴─╯$/)
  expect(new Set(report8.map(r => r.length)).size).toBe(1)
  await back.unmount()
  const whole = await mountSaid($, 'c-back-2', said, { columns: 80, rows: 40 })
  expect(await frameRows(whole)).toHaveLength(8)
  await whole.unmount()

  await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: 'Un título larguísimo para el aviso de que el worker ha terminado su trabajo de hoy', message: 'x' })
  const note: Said = { text: 'Agent "Largo" finished', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'agent-1', status: 'completed' } }
  const cut = await mountSaid($, 'c-note', note, { columns: 50, rows: 30, isFullscreen: true })
  expect(await frameRows(cut)).toHaveLength(3)
  expect((await frameRows(cut))[1]).toMatch(/…\s*│$/)
  const open = await mountSaid($, 'c-note-2', note, { columns: 50, rows: 30 })
  expect((await frameRows(open)).length).toBeGreaterThan(3)
  expect((await frameRows(open)).join('')).not.toMatch(/…/)
})
