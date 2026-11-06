// The crew's UI in Spanish, the one other language it speaks: the pane, the
// editor, /crew, the team view, the rows placed in the conversation, the
// bubbles, the toasts and the status line. The rest of the tests read the
// English UI; the text models read is English in both.
import { expect } from 'claude-code/testing'
import { DEFAULT_LOOK } from '../src/figure/look'
import { lookCode } from '../src/figure/share-code'
import { setLocale } from '../src/i18n/locale'
import { phaseLabel } from '../src/progress/phase'
import { declarePlan, stepShare, stepsLeft } from '../src/progress/plan'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { endNotice } from '../src/progress/text/ended'
import { notePieces } from '../src/progress/text/note'
import { given, headsUp, heldFor, started } from '../src/prompts/results'
import { resultFoots } from '../src/ui/transcript/foots'
import type { Member } from '../types'
import {
  DELEGATE,
  PANE,
  crewCommand,
  engine,
  frameRows,
  mountRow,
  mountSaid,
  progress,
  progressCrew,
  teamTexts,
  test,
  toolRow,
  usageReply,
  workerSend,
} from './support/crew'
import type { Said } from './support/crew'

// What this file imports from src speaks Spanish too: the plugin under test
// is a module of its own, told by its `language` option.
setLocale('es')

const ES = { options: { language: 'es' } }

// ---- the pane, the editor and /crew ----

test("the team view in Spanish: how each worker stands, and a plan's step, share and guess", ES, async ($, on) => {
  const { clock, states, delegate, end } = await progressCrew($, on)
  for (let i = 1; i <= 6; i++) await delegate(`Task ${i}`, `/work/r${i}`, `Tarea ${i}`)
  // Pip on a step of a plan that grew, Bolt waiting, the third failed, the
  // fourth stopped, the fifth still starting and the sixth free.
  await $.tool.call({ tool: 'Read', file_path: '/work/r1/a.ts', agentId: 'agent-1' })
  await progress($, 'agent-1', 1, 4, 'Leer')
  states.set('agent-2', 'waiting')
  states.set('agent-5', 'pending')
  await clock.advance(120_000)
  await progress($, 'agent-1', 3, 6, 'Escribir tests')
  await end('agent-3', 'error')
  await end('agent-4', 'aborted')
  await end('agent-6')
  states.set('agent-6', 'completed')
  await clock.advance(1000)
  const texts = await teamTexts($)
  for (const word of ['esperando', 'falló', 'detenido', 'arrancando', 'listo']) expect(texts).toContain(word)
  expect(texts).toContain('paso 3/6 · el plan creció · leyendo · 2m')
  expect(texts).toContain('██░░░░ 33 % de los pasos')
  expect(texts).toContain('≈4m más (estimado)')
  expect(texts).toContain('última 2m 0s · 0 llamadas')
})

test('the pane in Spanish: its top line, its count, its controls and its figures', ES, async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', repo: '/work/api' })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.findAll({ type: 'Svg' })).map(f => f.props.alt)).toEqual(['Nova, el orquestador', 'Pip: arrancando'])
  await desktop.unmount()

  for (let i = 2; i <= 11; i++) await $.tool.call({ tool: DELEGATE, task: `Task ${i}`, repo: `/work/r${i}` })
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  expect(await ui.find({ type: 'Text', text: /^Nova · Alegre · Opus 5\.5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^11 workers · 10 activos$/ })).toBeDefined()
  expect((await ui.find({ key: 'mode' }))?.props.label).toBe('Delegar: ON')
  expect((await ui.find({ key: 'edit' }))?.text).toBe(' Editar ')
  expect((await ui.find({ key: 'edit' }))?.props.label).toBe('Personalizar')
  expect((await ui.find({ key: 'view-agent-2' }))?.props.label).toBe('Ver a Bolt')
  expect((await ui.find({ key: 'crew-all' }))?.props.label).toBe('Ver todos (3 más)')
  await ui.unmount()
})

test('the editor in Spanish', ES, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  expect(await ui.find({ type: 'Text', text: /^Nova · Alegre · personalizar$/ })).toBeDefined()
  // A new orchestrator's catchphrase is the language's own.
  expect(await ui.find({ type: 'Text', text: /^¡Vamos allá!$/ })).toBeDefined()
  const tabs = await Promise.all(['persona', 'face', 'hair', 'clothes', 'extras', 'share'].map(id => ui.find({ key: `tab-${id}` })))
  expect(tabs.map(tab => tab?.props.label)).toEqual(['Carácter', 'Cara', 'Cabeza', 'Cuerpo', 'Extras', 'Compartir'])
  await ui.press({ key: 'tab-hair' })
  await ui.press({ key: 'next-hair' })
  expect(await ui.find({ type: 'Text', text: /^Mechón\s*$/ })).toBeDefined()
  expect((await ui.find({ key: 'next-hair' }))?.props.label).toBe('Forma: siguiente')
  await ui.press({ key: 'hairColor-3' })
  expect(await ui.find({ type: 'Text', text: /^Pelirrojo$/ })).toBeDefined()
  await ui.press({ key: 'tab-persona' })
  await ui.press({ key: 'vibe-pirate' })
  expect(await ui.find({ type: 'Text', text: /^Nova · Pirata · personalizar$/ })).toBeDefined()
  const done = await ui.find({ key: 'look-done' })
  expect([done?.props.label, done?.props.hotkey]).toEqual(['Listo', 'l'])
  await ui.press({ key: 'look-done' })
  expect(await ui.find({ type: 'Text', text: /^Nova · Pirata · Opus 5\.5$/ })).toBeDefined()
  await ui.unmount()
})

test('a copy that failed says so in Spanish, and the verb it points to answers with the code', ES, async ($, on) => {
  const toasts: string[] = []
  engine(on)
  on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-clipboard' } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-share' })
  await ui.press({ key: 'look-copy' })
  expect(toasts).toEqual(['Código no copiado: /crew codigo lo muestra'])
  await ui.unmount()
  expect((await crewCommand($, 'codigo')).text).toMatch(/^Código de Nova:\nCREW1\./)
})

test('/crew answers in Spanish and takes the verbs of either language', ES, async ($, on) => {
  engine(on)
  on('ui.copy', () => ({ value: { isCopied: true } }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect((await crewCommand($, 'help')).text).toMatch(/^\/crew {18}abre el panel\n\/crew equipo {11}todos los workers, uno por fila\n/)
  expect((await crewCommand($, '')).text).toBe('Panel de Nova abierto.')
  expect((await crewCommand($, 'equipo')).text).toBe('Equipo de Nova abierto.')
  expect((await crewCommand($, 'team')).text).toBe('Equipo de Nova abierto.')
  expect((await crewCommand($, 'editar')).text).toBe('Personalizando a Nova.')
  expect((await crewCommand($, 'msg Pip')).text).toBe('Uso: /crew msg <worker> <texto>')
  expect((await crewCommand($, 'modo off')).text).toBe('Nova trabajará sin delegar.')
  expect((await crewCommand($, 'mode on')).text).toBe('Nova delegará en workers.')
  expect((await crewCommand($, 'importar nada')).text).toBe('Ese código no es válido (empieza por CREW1.).')
  expect((await crewCommand($, `importar ${lookCode({ ...DEFAULT_LOOK, name: 'Luna' })}`)).text).toBe('¡Hola, Luna! Mascota importada.')
  expect((await crewCommand($, 'codigo')).text).toMatch(/^Código de Luna \(copiado\):\nCREW1\./)
  expect((await crewCommand($, 'aleatorio')).text).toBe('Luna estrena look.')
  expect((await crewCommand($, 'limpiar')).text).toBe('Workers terminados fuera del panel.')
  expect((await crewCommand($, 'progreso 4m')).text).toBe('Uso: /crew progreso [1m|2m|3m|5m|10m|off]')
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', repo: '/work/api' })
  expect((await crewCommand($, 'msg pip mira también el logout')).text).toBe('Mensaje enviado a Pip.')
})

test('the usage in Spanish', ES, async ($, on) => {
  engine(on, {
    rateLimits: [
      { kind: 'seven_day', percentUsed: 41.4 },
      { kind: 'five_hour', percentUsed: 12.5 },
    ],
    probe: () => usageReply(8),
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  const shown = (await ui.findAll({ type: 'Text', text: /^(5h|sem|fable)\s+\d+%$/ })).map(t => t.text.replace(/\s+/g, ' '))
  expect(shown).toEqual(['5h 13%', 'sem 41%', 'fable 8%'])
  await ui.unmount()
})

test("the feed in Spanish: the person's own line, its age, and what they pasted", ES, async ($, on) => {
  const clock = engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({
    text: 'Mira esto:\n<pasted_content id="071b">\nZod can exhaust memory\n</pasted_content>\ny arréglalo',
    wait: false,
    origin: { kind: 'composer' },
  })
  await clock.advance(1000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^ ─ tú → Nova · ahora / }))?.text).toMatch(/“Mira esto: \[pegado\] Zod can exhaust memory y arréglalo”$/)
  expect((await ui.find({ type: 'Text', text: /^tú$/ }))?.props.color).toBe('suggestion')
  expect(await ui.find({ type: 'Text', text: /^╭─ Tú/ })).toBeUndefined()
  await ui.unmount()
})

// ---- the team view ----

test("the team view in Spanish: each worker's phase, calls and time, or its last run's", ES, async ($, on) => {
  const { clock, states, delegate, end } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/web/README.md', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await clock.advance(72_000)
  await end('agent-2')
  states.set('agent-2', 'completed')
  await clock.advance(4000)
  await crewCommand($, 'equipo')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Equipo · 2 workers · 1 activo$/ })).toBeDefined()
  expect((await ui.find({ key: 'crew-back' }))?.props.label).toBe('◀ Volver')
  expect((await ui.find({ key: 'crew-clear' }))?.props.label).toBe('Limpiar terminados')
  expect(await ui.find({ type: 'Text', text: /^probando$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^listo$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1m · 1 llamada$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^última 1m 12s · 2 llamadas$/ })).toBeDefined()
  await ui.unmount()
})

// ---- what is placed in the conversation, the toasts and the status line ----

test('the status line in Spanish: each worker, its phase, its time and its task, then how it ended', ES, async ($, on) => {
  const { clock, status, delegate, end } = await progressCrew($, on)
  expect(await delegate('Run the tests', '/work/api', 'Arreglar tests')).toMatch(/^Started Pip /)
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip pensando 1s Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await clock.advance(60_000)
  expect(status()).toBe('crew · Pip leyendo 1m Arreglar tests')
  expect(await delegate('Review the README', '/work/web', 'Revisar README')).toMatch(/^Started Bolt /)
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await clock.advance(120_000)
  expect(status()).toBe('crew · Pip leyendo 3m Arreglar tests · Bolt editando 2m Revisar README')
  await end('agent-1')
  await clock.advance(1000)
  expect(status()).toBe('crew · Bolt editando 2m Revisar README · ✓ Pip listo')
  await end('agent-2', 'error')
  await clock.advance(1000)
  expect(status()).toBe('crew · ✓ Pip listo · × Bolt falló')
  await clock.advance(JUST_ENDED_MS - 1000)
  expect(status()).toBeUndefined()
  expect(await delegate('Now the login', '/work/api', 'Login')).toMatch(/^Given to Pip /)
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await clock.advance(120_000)
  expect(status()).toBe('crew · Pip probando 2m Login')
})

test('a check-in in Spanish: whole while it is the newest, then folded, and what /crew progreso says', ES, async ($, on) => {
  const { clock, placed, delegate, end, lines } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 activo · ronda 3m', '  Pip  leyendo  3m  Read a.ts'])

  await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await delegate('Review the README', '/work/web', 'Revisar README')
  await clock.advance(180_000)
  expect(placed).toHaveLength(2)
  expect(await lines(placed[1]!)).toEqual(['─ crew · 2 activos · ronda 6m', '  Pip   editando  6m  Edit a.ts', '  Bolt  pensando  3m'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · ronda 3m · Pip leyendo 3m'])

  await end('agent-2')
  expect(await crewCommand($, 'progreso 1m')).toEqual({})
  expect(await lines(placed[2]!)).toEqual([
    '─ crew · 1 activo · ronda 6m · aviso cada 1m',
    '  Pip   editando  6m  Edit a.ts',
    '  Bolt  ✓ listo   3m  Revisar README',
  ])
  await end('agent-1')
  await clock.advance(1000)
  expect(await crewCommand($, 'progreso')).toEqual({})
  expect(await lines(placed[placed.length - 1]!)).toEqual(['─ crew · nadie trabajando · aviso cada 1m'])
  expect(await crewCommand($, 'progreso off')).toEqual({})
  expect(await lines(placed[placed.length - 1]!)).toEqual(['─ crew · nadie trabajando · sin avisos'])
})

test('a summary row in Spanish: how each ended and its time, then folded under the next', ES, async ($, on) => {
  const { clock, placed, delegate, end, lines } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await progress($, 'agent-2', 2, 4, 'Leer')
  await clock.advance(40_000)
  await end('agent-2', 'error')
  await clock.advance(20_000)
  await end('agent-1')
  await clock.advance(1000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · ronda terminada · 1m', '  × Bolt    40s  2/4  Revisar README', '  ✓ Pip   1m 0s       Arreglar tests'])
  await delegate('Migrate the schema', '/work/db', 'Migración')
  await clock.advance(200_000)
  await end('agent-3')
  await clock.advance(1000)
  expect(placed).toHaveLength(3)
  expect(await lines(placed[2]!)).toEqual(['─ crew · ronda terminada · 3m', '  ✓ Mika  3m 20s  Migración'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · ronda de 1m · × Bolt 2/4 40s · ✓ Pip 1m 0s'])
})

test("a run's end and a message between agents in Spanish: their lines, the end bubble and the toasts", ES, async ($, on) => {
  const { clock, seen, placed, toasts, delegate, end, lines } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await delegate('Build the session bus', '/work/bus', 'Session bus')
  await progress($, 'agent-2', 2, 4, 'Leer')
  await clock.advance(65_000)
  await end('agent-1')
  await end('agent-2', 'aborted')
  expect(toasts).toEqual(['✓ Pip terminó: Arreglar tests · 1m 5s', '■ Bolt detenido: Revisar README · paso 2/4 · 1m 5s'])
  const note = (status: string, durationMs?: number): Said => ({
    text: 'Agent "Revisar README" finished',
    origin: { kind: 'task-notification' },
    isExpanded: false,
    task: { id: 'agent-2', status, ...(durationMs !== undefined ? { durationMs } : {}) },
  })
  for (const [id, status, head] of [
    ['end-a', 'killed', /^╭─ Bolt → Nova · ■ detenido · paso 2\/4 · 1m 5s ─+╮$/],
    ['end-b', 'failed', /^╭─ Bolt → Nova · × falló · paso 2\/4 · 1m 5s ─+╮$/],
    ['end-c', 'completed', /^╭─ Bolt → Nova · ✓ listo · 1m 5s ─+╮$/],
  ] as const) {
    const ui = await mountSaid($, id, note(status))
    expect((await frameRows(ui))[0]).toMatch(head)
    await ui.unmount()
  }

  // Mika's message wakes Pip, free; one the crew could not pass on says so.
  const send = async (message: string) => {
    await $.tool.call({ tool: 'SendMessage', to: 'pip', message, agentId: 'agent-3' })
    return workerSend($, 'pip', message, 'agent-3')
  }
  await clock.advance(1000)
  await send('Mika: both fixed')
  await clock.advance(1000)
  expect(await lines(placed[placed.length - 1]!)).toEqual(['● Mika → Pip: Mika: both fixed · lo despierta'])
  await end('agent-1')
  await clock.advance(1000)
  ;(seen as { failSends?: boolean }).failSends = true
  await send('Mika: one more thing')
  await clock.advance(1000)
  expect(await lines(placed[placed.length - 1]!)).toEqual(['● Mika → Pip: Mika: one more thing · no entregado'])
  expect(toasts[toasts.length - 1]).toMatch(/^No llegó a Pip el mensaje de Mika: /)
})

// ---- the crew's bubbles in the conversation ----

test('a card in the desktop app in Spanish: its foot and its press', ES, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  const input = { task: 'Línea uno.\nLínea dos.', title: 'Login', repo: '/work/api' }
  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_c1', ...input })).result)
  const props = toolRow(DELEGATE, 'toolu_c1', input, { output })
  const row = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'ToolUse', requestId: 'toolu_c1', props, viewport: { columns: 100, rows: 40 } })
  expect(await row.find({ type: 'Text', text: /^Nova → Pip · Login · nuevo$/ })).toBeDefined()
  expect((await row.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Ver todo'])
  await row.press({ key: 'toolu_c1:more' })
  await row.redraw()
  expect((await row.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Ver menos'])
})

test('a delegate bubble in Spanish: new or reused, who else works there, and its press', ES, async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const call = async (id: string, input: Record<string, unknown>) => {
    const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: id, ...input })).result)
    return { row: await mountRow($, toolRow(DELEGATE, id, input, { output })), output }
  }
  const done = (id: string) => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id, agentId: id, reason: 'answer' })

  const first = await call('toolu_h1', { task: 'Línea uno.\nLínea dos.\nLínea tres.', title: 'Login', repo: '/work/api' })
  expect(await first.row.find({ type: 'Text', text: /^╰─ nuevo ─+╯$/ })).toBeDefined()
  expect((await first.row.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Ver todo'])
  await first.row.press({ key: 'toolu_h1:more' })
  await first.row.redraw()
  expect((await first.row.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Ver menos'])
  const second = await call('toolu_h2', { task: 'Arregla el checkout', title: 'Checkout', repo: '/work/api', fresh: true })
  expect(await second.row.find({ type: 'Text', text: /^╰─ nuevo · ! Pip trabaja aquí ─+╯$/ })).toBeDefined()
  // Reused while Bolt works there: the long form does not fit, the short one does.
  await done('agent-1')
  const third = await call('toolu_h3', { task: 'Y el registro', title: 'Registro', repo: '/work/api' })
  expect(await third.row.find({ type: 'Text', text: /^╰─ reutilizado · ! Bolt trabaja aquí ─+╯$/ })).toBeDefined()
  await done('agent-1')
  await done('agent-2')
  const fourth = await call('toolu_h4', { task: 'Revisa el checkout', title: 'Revisión', worker: 'bolt' })
  expect(await fourth.row.find({ type: 'Text', text: /^╰─ reutilizado · conserva su contexto ─+╯$/ })).toBeDefined()

  const ask = { to: 'pip', summary: 'Amplía el login', message: 'Añade el caso de la contraseña caducada.' }
  await $.tool.call({ tool: 'SendMessage', tool_use_id: 'toolu_s1', ...ask })
  const sent = await mountRow(
    $,
    toolRow('SendMessage', 'toolu_s1', ask, { output: { success: true, message: 'Resuming agent pip', resumedAgentId: 'agent-1' } }),
  )
  expect(await sent.find({ type: 'Text', text: /^╰─ despierta a Pip ─+╯$/ })).toBeDefined()
  await sent.redraw(toolRow('SendMessage', 'toolu_s1', ask, { output: { success: true, message: "Message sent to pip's inbox" } }))
  expect(await sent.find({ type: 'Text', text: /^╰─ entregado ─+╯$/ })).toBeDefined()
  await sent.unmount()
})

// ---- the words the crew builds ----

test('the words the crew builds in Spanish: phases, plans, ends, messages and results', () => {
  expect((['thinking', 'reading', 'editing', 'running', 'testing', 'web', 'delegating', 'waiting'] as const).map(phaseLabel)).toEqual([
    'pensando',
    'leyendo',
    'editando',
    'ejecutando',
    'probando',
    'navegando',
    'delegando',
    'esperando',
  ])

  const third = declarePlan(declarePlan(undefined, 0, 5, 'Plan'), 3, 5, 'Escribir tests')
  expect(stepShare(third)).toBe('40 % de los pasos')
  expect(stepsLeft(third, 360_000)).toBe('≈9m más (estimado)')

  expect(endNotice({ id: 'a', name: 'Pip', end: 'done', doing: 'Arreglar tests', plan: declarePlan(undefined, 4, 4, 'x'), ms: 725_000 })).toBe(
    '✓ Pip terminó: Arreglar tests · 12m 5s',
  )
  expect(endNotice({ id: 'b', name: 'Bolt', end: 'failed', doing: 'Revisar README', plan: declarePlan(undefined, 2, 4, 'x'), ms: 180_000 })).toBe(
    '× Bolt falló: Revisar README · paso 2/4 · 3m 0s',
  )
  expect(endNotice({ id: 'c', name: 'Mika', end: 'stopped', doing: '', ms: 4_000 })).toBe('■ Mika detenido · 4s')

  const text = (pieces: { text: string }[]) => pieces.map(p => p.text).join('')
  const note = { fromId: 'agent-2', from: 'Bolt', toId: 'agent-1', to: 'Pip', gist: 'router fixed', wakes: true, isLost: false }
  expect(text(notePieces(note, 80))).toBe('● Bolt → Pip: router fixed · lo despierta')
  expect(text(notePieces({ ...note, isLost: true, wakes: false }, 80))).toBe('● Bolt → Pip: router fixed · no entregado')
  expect(text(notePieces(note, 36))).toBe('● Bolt → Pip: router… · lo despierta')
  expect(text(notePieces(note, 30))).toBe('● Bolt → Pip · lo despierta')

  const pip: Member = { id: 'agent-1', name: 'Pip', address: 'pip' }
  const bolt: Member = { id: 'agent-2', name: 'Bolt', address: 'bolt' }
  const foots = (tool: string, output: unknown) => resultFoots(tool, output, pip, [pip, bolt], DEFAULT_LOOK)?.map(f => f.map(x => x.text).join(''))
  expect(foots('SendMessage', { success: true, message: 'ok' })).toEqual(['entregado'])
  expect(foots('SendMessage', { success: true, resumedAgentId: 'agent-1', message: 'Resuming' })).toEqual(['despierta a Pip', 'despierta'])
  expect(foots('mcp__crew__delegate', [{ type: 'text', text: given(pip, '/w', '') }])).toEqual(['reutilizado · conserva su contexto', 'reutilizado'])
  expect(foots('mcp__crew__delegate', started('Pip', 'pip', 'agent-1', '/w', headsUp(['Bolt'])))).toEqual([
    'nuevo · ! Bolt trabaja aquí',
    'nuevo · ! Bolt trabaja aquí',
    'nuevo · ! 1 más aquí',
    'nuevo',
  ])
  expect(foots('mcp__crew__delegate', given(pip, '/w', headsUp(['Bolt', 'Mika'])))).toEqual([
    'reutilizado · conserva su contexto · ! Bolt y Mika trabajan aquí',
    'reutilizado · ! Bolt y Mika trabajan aquí',
    'reutilizado · ! 2 más aquí',
    'reutilizado',
  ])
  expect(foots('mcp__crew__delegate', heldFor(pip, 'Bolt', 1))).toEqual(['en espera · responde a Bolt', 'en espera'])
})
