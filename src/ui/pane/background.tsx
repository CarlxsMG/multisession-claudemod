// The team view's list of the shells and Monitors left running in the
// background: whose each is, how long it has run, its process, what it
// runs, and a Stop for each.
import type { BackgroundTask } from '../../../types'
import { stopTask } from '../../background/sweep'
import type { Engine } from '../../engine'
import { t } from '../../i18n'
import { readBackground, readMembers } from '../../state/atoms'
import { shortTime } from '../../util/time'
import type { CrewContext } from './widgets'

/** One task's line after its Stop: whose it is, its age, its process once known and its command. */
export function taskLine(task: BackgroundTask, owner: string, now: number): string {
  const kind = task.kind === 'monitor' ? ` · ${t().background.monitor}` : ''
  const pid = task.pid !== undefined ? ` · ${t().background.pid(task.pid)}` : ''
  return `${owner} · ${shortTime(Math.max(0, now - task.startedAt))}${kind}${pid} · ${task.command || task.id}`
}

/**
 * The tasks left running in the background, newest first, each with a Stop
 * the person presses; nothing when there are none.
 */
export async function drawBackground($: Engine, ctx: CrewContext) {
  const { ui, now } = ctx
  const { Box, Text, Button } = ui
  const tasks = [...(await readBackground($))].reverse()
  if (tasks.length === 0) return undefined
  const members = await readMembers($)
  const ownerOf = (task: BackgroundTask): string =>
    task.agentId === undefined ? t().background.main : (members.find(m => m.id === task.agentId)?.name ?? task.agentId)
  return (
    <Box flexDirection="column">
      <Text dimColor wrap="truncate-end">
        {t().background.heading(tasks.length)}
      </Text>
      {tasks.map(task => (
        <Box flexDirection="row" columnGap={1}>
          <Button key={`bg-stop-${task.id}`} label={t().background.stop} onPress={() => void stopTask($, task, 'press')} />
          <Text wrap="truncate-end" color={task.stopFailedAt !== undefined ? 'warning' : 'text'} dimColor={task.stopFailedAt === undefined}>
            {taskLine(task, ownerOf(task), now)}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
