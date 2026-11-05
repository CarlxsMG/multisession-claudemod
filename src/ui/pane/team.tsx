// The pane's team view: every worker, one to a row.
import type { Worker } from '../../../types'
import { clearFinished } from '../../crew/sync'
import { ACTIVE, FINISHED } from '../../crew/workers'
import type { Engine } from '../../engine'
import { DIAMOND_W } from '../../figure/diamond'
import { t } from '../../i18n'
import { phaseLabel, shownPhase } from '../../progress/phase'
import { isOpen } from '../../progress/runs'
import { teamLines } from '../../progress/text/team'
import { readRuns, updateView } from '../../state/atoms'
import { basename } from '../../util/path'
import { oneLine } from '../../util/text'
import { statusLabel } from '../labels'
import type { PaneUi, WorkerKit } from './widgets'

/**
 * The whole team, one to a row: a worker at work says its phase, and each
 * one its run's time and calls, or its last run's; one with a plan its step,
 * the share of the steps done and, once one is, what the rest may take.
 */
export async function drawTeam($: Engine, ui: PaneUi, kit: WorkerKit, now: number, width: number) {
  const { Box, Text, Button } = ui
  const { list, active, ordered, statusColor, figure, nameButton } = kit
  const runOf = new Map((await readRuns($)).map(r => [r.id, r]))
  const stateOf = (w: Worker): string => {
    const run = runOf.get(w.id)
    return run !== undefined && isOpen(run) && w.status === 'working' ? phaseLabel(shownPhase(run, w.status)) : statusLabel(w.status)
  }
  const runRoom = Math.max(8, width - DIAMOND_W - 1)
  // A worker with a plan is doing its step; else its last call says.
  const doingOf = (w: Worker): string => {
    const run = runOf.get(w.id)
    return (run !== undefined && isOpen(run) ? run.plan?.doing : undefined) || w.activity
  }
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button key="crew-back" label={t().pane.back} onPress={() => void updateView($, () => 'main')} />
        <Text dimColor wrap="truncate-end">{`${t().pane.team} · ${t().pane.count(list.length, active.length)}`}</Text>
        {list.some(w => FINISHED.has(w.status)) && (
          <Button key="crew-clear" label={t().pane.clearFinished} onPress={() => void clearFinished($)} />
        )}
      </Box>
      {ordered.map(worker => (
        <Box flexDirection="row" columnGap={1}>
          {figure(worker, statusLabel(worker.status))}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Box flexDirection="row">
              {nameButton(worker)}
              <Text dimColor> · </Text>
              <Text wrap="truncate-end" color={statusColor(worker)} dimColor={!ACTIVE.has(worker.status)}>
                {stateOf(worker)}
              </Text>
            </Box>
            <Text dimColor wrap="truncate-end">{basename(worker.cwd)}</Text>
            <Text dimColor wrap="truncate-end">{worker.task}</Text>
            {ACTIVE.has(worker.status) && doingOf(worker) !== '' && <Text wrap="truncate-end">{doingOf(worker)}</Text>}
            {runOf.has(worker.id) &&
              teamLines(runOf.get(worker.id)!, stateOf(worker), now).map(line => (
                <Text dimColor wrap="truncate-end">
                  {oneLine(line, runRoom)}
                </Text>
              ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
