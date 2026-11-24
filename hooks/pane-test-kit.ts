// Shared staging for the pane and snapshot tests: what sits beneath the mod in the engine's test kit.
import { mergeRows, renderIndex } from './index-file'
import { until } from './scan-test-kit'

export const ID = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.App/containerApps/web'
export const ID2 = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/api'
export const STORE_KEY = 'snapshots-1'
export const PANE = {
  plugin: 'azure-resources',
  component: 'Pane',
  requestId: 'azure-resources',
  props: { title: 'Azure resources', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

export const indexText = (ids: string[]) =>
  renderIndex({
    before: '',
    after: '',
    badRows: [],
    rows: mergeRows(
      [],
      ids.map((id) => {
        const p = id.split('/')
        return { id, name: p[p.length - 1]!, type: `${p[6]}/${p[7]}`, resourceGroup: p[4]!, subscription: p[2]!, source: 'hook' as const }
      }),
      '2026-11-23T10:00:00Z',
    ),
  })

export type Answer = { exitCode: number; stdout: string; stderr: string }
export const okShow = (id: string): Answer => ({
  exitCode: 0,
  stderr: '',
  stdout: JSON.stringify({ id, location: 'italynorth', properties: { provisioningState: 'Succeeded', nested: { a: 1 }, list: [1, 2, 3], password: 'hunter2' } }),
})

export type StageOpts = { storeFails?: boolean; storeGate?: Promise<void> }

export function stage(on: any, ids: string[], answer: (argv: readonly string[]) => Answer, opts: StageOpts = {}) {
  const argvs: string[][] = []
  const store = new Map<string, unknown>()
  const sets: unknown[] = []
  const gets: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: indexText(ids) }))
  on('store.get', async (_: unknown, e: { key: string }) => {
    await opts.storeGate
    gets.push(e.key)
    return { value: store.get(e.key) }
  })
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    sets.push(e.value)
    if (opts.storeFails) throw new Error('store full')
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    argvs.push([...e.argv])
    return { value: answer(e.argv) }
  })
  return { argvs, store, sets, gets }
}

export const idOf = (argv: readonly string[]) => argv[argv.indexOf('--ids') + 1]!
export const start = ($: any) => $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
export const update = ($: any): Promise<{ text: string }> => $.command.run({ command: 'azure-update', args: '' })

/** /azure-update answers at once; the refresh ends with one store write. */
export const updated = async ($: any, s: { sets: unknown[] }) => {
  const before = s.sets.length
  const res = await update($)
  await until(() => s.sets.length > before)
  await until(async () => !(await busyText($)))
  return res
}

export const flows = async ($: any, s: { sets: unknown[] }) => {
  await start($)
  return updated($, s)
}

/** The pane's busy line ('Updating…', 'Scanning…'), or '' when idle. */
export async function busyText($: any): Promise<string> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map((n: { text?: string }) => n.text ?? '')
  await ui.unmount()
  return texts.find((t: string) => t === 'Updating…' || t === 'Scanning…') ?? ''
}

/** True when the pane, drawn now, has a Text matching `re`. */
export async function paneHas($: any, re: RegExp): Promise<boolean> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Text', text: re })
  await ui.unmount()
  return found !== undefined
}

/** Picks a tab as a click on its name does: the tab names Client posts `{ select: key }`. */
export const pickTab = (ui: any, key: string): Promise<void> => ui.post({ select: key }, { in: 'tabs' })

/** The selected tab's key, as handed to the tab names Client. */
export const selectedTab = async (ui: any): Promise<string | undefined> => (await ui.find({ type: 'Client' }))?.props.props.selected
