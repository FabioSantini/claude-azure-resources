// The "Azure resources" pane, its commands and the session-start load.
import type { Register } from 'claude-code'
import type { Busy, IndexRow } from '../types'
import { Card } from './card'
import { readExpanded, toggleExpanded } from './props-view'
import { startScan, type ScanHost } from './scan'
import { scanSessionStart } from './scan-hooks'
import { isUpdating, loadSnapshots, readView, rowsFromFile, refreshOne, updateAll } from './snapshots'
import { groupByType, pickTab, readSelectedTab, selectTab } from './tabs'
import { registerTabEvents, tabRow } from './tab-row'

const PANE = 'azure-resources'
const TITLE = 'Azure resources'
const SUBTITLE = 'by Fabio Santini'

/** The Scan button and /azure-scan: open the pane, start the scanner agent. */
export async function onScan($: ScanHost & { ui: { open: (args: { id: string; title: string }) => Promise<unknown> } }): Promise<string> {
  await $.ui.open({ id: PANE, title: TITLE })
  return startScan($, await $.session.cwd())
}

const BUSY_TEXT = { idle: '', update: 'Updating…', scan: 'Scanning…' } as const

type Opts = { azPython: string; parallel: number }
type On = Parameters<Register>[0]

export function registerPane(on: On, opts: Opts): void {
  registerStart(on)
  registerCommands(on, opts)
  registerView(on, opts)
  registerTabEvents(on)
}

function registerStart(on: On): void {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'azure-update', description: 'Refresh the Azure resources pane from Azure' })
      await $.command.register({ name: 'azure-scan', description: 'Scan this session for Azure resources' })
    } catch {
      // never break the session start
    }
    await scanSessionStart($)
    // Loading the stored snapshots never delays the session (loadSnapshots never rejects).
    void loadSnapshots($)
    return next(e)
  })
}

function registerCommands(on: On, opts: Opts): void {
  // Answers at once; the refresh runs in the background and the pane shows its progress.
  on('command.run', { command: 'azure-update' }, async ($) => {
    await $.ui.open({ id: PANE, title: TITLE })
    const cwd = await $.session.cwd()
    if (isUpdating()) return { text: 'Azure resources: an update is already running.' }
    void updateAll($, cwd, opts.azPython, opts.parallel).catch(() => undefined)
    return { text: 'Azure resources: update started.' }
  })

  on('command.run', { command: 'azure-scan' }, async ($) => ({ text: await onScan($) }))
}

type HeaderActions = { onUpdate: () => void; onScan: () => void }

function header(ui: any, state: Busy, a: HeaderActions) {
  const { Box, Text, Button } = ui
  const busyText = BUSY_TEXT[state]
  return (
    <Box key="header" flexDirection="column">
      <Box key="title-row" flexDirection="row" justifyContent="space-between">
        <Box key="title" flexDirection="column">
          <Text bold>{TITLE}</Text>
          <Text dimColor>{SUBTITLE}</Text>
        </Box>
        <Box key="actions" flexDirection="row" gap={1}>
          <Button key="update" onPress={a.onUpdate}>Update</Button>
          <Button key="scan" onPress={a.onScan}>Scan</Button>
        </Box>
      </Box>
      {busyText !== '' && <Text dimColor>{busyText}</Text>}
    </Box>
  )
}

function registerView(on: On, opts: Opts): void {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as any
    const { Box, Text } = ui
    const view = await readView($)
    // After a restart the atom is empty: show azure.md itself (file only, no az). A render never writes.
    const list = view.rows.length > 0 ? view.rows : await rowsFromFile($)
    const tabs = groupByType(list)
    const selected = pickTab(tabs, await readSelectedTab($))
    const open = await readExpanded($)
    const visible = (selected?.rows ?? []).map((r) => r.id)
    const card = (row: IndexRow) =>
      Card(ui, row, view.snaps[row.id], () => void refreshOne($, opts.azPython, row.id).catch(() => undefined), open.includes(row.id), () => void toggleExpanded($, row.id, visible))
    return (
      <Box flexDirection="column">
        {header(ui, view.busy, {
          onUpdate: async () => { await updateAll($, await $.session.cwd(), opts.azPython, opts.parallel).catch(() => undefined) },
          onScan: () => void onScan($).catch(() => undefined),
        })}
        {list.length === 0 && <Text dimColor>No resources yet. Run Scan.</Text>}
        {tabs.length > 0 && tabRow(ui, e.surface, tabs, selected, (key) => void selectTab($, key))}
        {(selected?.rows ?? []).map(card)}
      </Box>
    )
  })
}
