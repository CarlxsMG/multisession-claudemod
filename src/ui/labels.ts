// The words, marks and colors the crew's UI gives each worker status and
// each end of a run, in one place, so the pane, the status line, the toasts
// and the rows in the conversation say the same.
import type { RunEndKind, WorkerStatus } from '../../types'
import { t } from '../i18n'

/** A worker's status, as the pane and the check-ins name it. */
export const statusLabel = (status: WorkerStatus): string => t().status[status]

/**
 * A worker's status on its card, in its four columns, where the words above
 * do not fit; a free worker's card says nothing.
 */
export const cardLabel = (status: WorkerStatus): string => t().pane.card[status]

/**
 * How a run ended: its mark and its color. Each end has a mark of its own,
 * so failed and stopped read apart without color too.
 */
export const END: Record<RunEndKind, { mark: string; color: string }> = {
  done: { mark: '✓', color: 'success' },
  failed: { mark: '×', color: 'error' },
  stopped: { mark: '■', color: 'warning' },
}

/** The verb a line about a run's end takes: `Pip finished`. */
export const endVerb = (end: RunEndKind): string => t().endVerb[end]

/** An end as a status, with its mark: `✓ done`. */
export const endMarked = (end: RunEndKind): string => `${END[end].mark} ${statusLabel(end)}`
