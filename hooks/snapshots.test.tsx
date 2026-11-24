// Store writes of the snapshots: best-effort, once per Update, pruned; the load never hides newer ones.
import { expect, test } from 'claude-code/testing'
import { MAX_STORED, pruneSnapshots } from './snapshots'
import { until } from './scan-test-kit'
import { ID, ID2, PANE, STORE_KEY, busyText, idOf, okShow, paneHas, stage, start, update, updated } from './pane-test-kit'
import type { Snapshot } from '../types'

const idN = (n: number) => `/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app${n}`
const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()
const many = (n: number): Record<string, Snapshot> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [idN(i), { id: idN(i), at: at(i) }]))

test('pruning keeps the newest snapshots', () => {
  const kept = pruneSnapshots(many(400))
  expect(Object.keys(kept).length).toBe(MAX_STORED)
  expect(kept[idN(399)]).toBeDefined()
  expect(kept[idN(99)]).toBeUndefined()
  expect(kept[idN(100)]).toBeDefined()
})

test('a rejecting store.set: Update still refreshes every card and ends', async ($, on) => {
  const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)), { storeFails: true })
  await start($)
  expect((await update($)).text).toBe('Azure resources: update started.')
  await until(async () => s.sets.length > 0 && (await busyText($)) === '')
  expect(s.argvs.length).toBe(2)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // one card per tab: the App Service card is the one shown
  expect((await ui.findAll({ type: 'Text', text: /^Updated \d\d\/\d\d / })).length).toBe(1)
  // the per-card Refresh survives the failed store write too
  await ui.press({ key: `refresh:${ID2}` })
  expect(s.argvs.length).toBe(3)
  expect(await ui.find({ type: 'Text', text: /Failed/ })).toBeUndefined()
  await ui.unmount()
  expect((await update($)).text).toBe('Azure resources: update started.')
})

test('one store write per Update', async ($, on) => {
  const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
  await start($)
  await updated($, s)
  expect(s.sets.length).toBe(1)
})

test('400 stored snapshots are written back as 300', async ($, on) => {
  const s = stage(on, [], () => okShow(ID))
  s.store.set(STORE_KEY, many(400))
  await start($)
  await updated($, s)
  expect(Object.keys(s.store.get(STORE_KEY) as object).length).toBe(MAX_STORED)
})

test('a slow store load does not hide a snapshot refreshed meanwhile', async ($, on) => {
  let open = () => {}
  const storeGate = new Promise<void>((r) => { open = r })
  const s = stage(on, [ID], (argv) => okShow(idOf(argv)), { storeGate })
  s.store.set(STORE_KEY, { [ID]: { id: ID, at: '2020-01-01T00:00:00Z', error: 'timeout' } })
  await start($)
  await updated($, s)
  expect(s.gets.length).toBe(0)
  open()
  await until(() => s.gets.length > 0)
  expect(await paneHas($, /Timed out/)).toBe(false)
  expect(await paneHas($, /Succeeded/)).toBe(true)
})
