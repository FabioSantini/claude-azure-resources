// New rows (report_resources, the recorder) are refreshed right away, at most `parallel` at a time.
import { expect, test } from 'claude-code/testing'
import { isArmId } from './arm-id'
import { enqueue, isPending } from './new-rows'
import { REPORT, SUB, call, offer, report, scan, seeAndReport, stage, start, until } from './scan-test-kit'
import { busyText, paneHas } from './pane-test-kit'

const site = (n: number | string) => `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/fresh${n}`
const PROJECT = `/subscriptions/${SUB}/resourceGroups/rg-demo/providers/Microsoft.CognitiveServices/accounts/my-foundry/projects/Demo`
const shows = (argvs: string[][], id?: string) => argvs.filter((a) => a.includes('show') && (id === undefined || a.includes(id))).length
const timer = globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }
const pause = (ms: number) => new Promise<void>((r) => timer.setTimeout(r, ms))

const scanning = async ($: any, on: any, hangRuns = false) => {
  const s = stage(on, { hangRuns })
  await start($)
  await scan($)
  await offer($, 'scan-1')
  return s
}

test('a child resource id (Foundry project) is a valid ARM id', () => {
  expect(isArmId(PROJECT)).toBe(true)
})

test('a row report_resources adds is refreshed while the scan still runs', async ($, on) => {
  const s = await scanning($, on)
  await seeAndReport($, [{ id: site(1) }])
  await until(() => shows(s.argvs, site(1)) > 0)
  expect(shows(s.argvs, site(1))).toBe(1)
  expect(await busyText($)).toBe('Scanning…')
})

test('a child id reported by the scanner is refreshed too', async ($, on) => {
  const s = await scanning($, on)
  await seeAndReport($, [{ id: PROJECT }])
  await until(() => shows(s.argvs, PROJECT) > 0)
  expect(shows(s.argvs, PROJECT)).toBe(1)
})

test('new rows are refreshed at most 4 at a time (refreshParallel)', async ($, on) => {
  const s = await scanning($, on, true)
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: site(i), name: `fresh${i}` }))
  await seeAndReport($, rows)
  await until(() => shows(s.argvs) >= 4)
  await pause(50)
  expect(shows(s.argvs)).toBe(4)
})

test('a row reported twice is refreshed once', async ($, on) => {
  const s = await scanning($, on)
  const rows = [{ id: site(2), name: 'fresh2' }]
  await seeAndReport($, rows)
  await until(() => shows(s.argvs, site(2)) > 0)
  await pause(20)
  await call($, { tool: REPORT, rows, agentId: 'scan-1' })
  await pause(50)
  expect(shows(s.argvs, site(2))).toBe(1)
})

test('a row the recorder adds is refreshed right away', async ($, on) => {
  const s = stage(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: `az resource show --ids ${site(3)}` })
  await until(() => shows(s.argvs, site(3)) > 0)
  expect(shows(s.argvs, site(3))).toBe(1)
})

test('the busy state leaves Scanning once the scanner reports', async ($, on) => {
  await scanning($, on)
  expect(await busyText($)).toBe('Scanning…')
  await report($, 'scan-1')
  await until(async () => (await busyText($)) === '')
  expect(await busyText($)).toBe('')
  expect(await paneHas($, /^Scanning…$/)).toBe(false)
})

test('each queued row runs its own job (its host and options), in order, within its limit', async () => {
  const gates: (() => void)[] = []
  const calls: string[] = []
  const job = (tag: string) => () => {
    calls.push(tag)
    return new Promise<void>((r) => gates.push(r))
  }
  expect(enqueue('q1', 1, job('h1:q1'))).toBe(true)
  expect(enqueue('q2', 1, job('h1:q2'))).toBe(true)
  expect(enqueue('q3', 1, job('h2:q3'))).toBe(true)
  expect(enqueue('q3', 1, job('h2:again'))).toBe(false)
  expect(calls).toEqual(['h1:q1'])
  expect([isPending('q1'), isPending('q3'), isPending('zz')]).toEqual([true, true, false])
  for (let i = 0; i < 3; i++) {
    await until(() => gates.length > 0)
    gates.shift()!()
  }
  await until(() => !isPending('q3'))
  expect(calls).toEqual(['h1:q1', 'h1:q2', 'h2:q3'])
})
