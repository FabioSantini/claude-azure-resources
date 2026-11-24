// Session start, Update during a scan, new rows reaching the pane, the scanner's report.
import { expect, test } from 'claude-code/testing'
import { REPORT, SUB, call, offer, report, scan, seeAndReport, stage, start, until } from './scan-test-kit'
import { busyText, paneHas } from './pane-test-kit'

const ID2 = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/fresh2'
const ID3 = `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/fresh3`
const WEB0 = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.App/containerApps/web0'
const TABLE =
  '| id | name | type | resourceGroup | subscription | source | firstSeen | lastSeen |\n|---|---|---|---|---|---|---|---|\n' +
  `| ${WEB0} | web0 | t | rg | s1 | hook | x | x |\n`
const updateCmd = ($: any): Promise<{ text: string }> => $.command.run({ command: 'azure-update', args: '' })
const timer = globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }
const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p.then(() => 'done'), new Promise<string>((r) => timer.setTimeout(() => r('stuck'), ms))])
const idle = ($: any) => until(async () => (await busyText($)) === '')

test('session.start answers while the store and the agent list never answer', async ($, on) => {
  on('command.register', () => ({ value: { command: 'x' } }))
  on('agent.register', () => ({ value: { agent: 'azure-resources:scanner' } }))
  on('tool.register', () => ({ value: { tool: REPORT } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('store.get', () => new Promise(() => undefined))
  on('agent.list', () => new Promise(() => undefined))
  expect(await within(start($), 1000)).toBe('done')
})

test('/azure-update answers at once', async ($, on) => {
  stage(on, { file: TABLE, hangRuns: true })
  await start($)
  expect(await within(updateCmd($), 1000)).toBe('done')
  expect((await updateCmd($)).text).toBe('Azure resources: an update is already running.')
})

test('an Update during a scan leaves the pane scanning', async ($, on) => {
  stage(on)
  await start($)
  expect((await scan($)).text).toBe('Azure resources: scan started.')
  await offer($, 'scan-1')
  expect((await updateCmd($)).text).toBe('Azure resources: update started.')
  await until(async () => (await busyText($)) !== 'Updating…')
  expect(await busyText($)).toBe('Scanning…')
})

test('a row the recorder adds appears without another Update', async ($, on) => {
  const s = stage(on, { file: TABLE })
  await start($)
  await updateCmd($)
  await idle($)
  expect(await paneHas($, /web0/)).toBe(true)
  await $.tool.call({ tool: 'Bash', command: `az resource show --ids ${ID2}` })
  await until(() => paneHas($, /fresh2/))
  expect(await paneHas($, /fresh2/)).toBe(true)
  expect(s.files.get('C:/proj/azure.md')).toContain(ID2)
})

test('a row report_resources adds appears without another Update', async ($, on) => {
  stage(on, { file: TABLE })
  await start($)
  await updateCmd($)
  await idle($)
  await scan($)
  await offer($, 'scan-1')
  await seeAndReport($, [{ id: ID3 }])
  await until(() => paneHas($, /fresh3/))
  expect(await paneHas($, /fresh3/)).toBe(true)
})

test('the scanner report is consumed, so the main chat is not woken', async ($, on) => {
  stage(on)
  await start($)
  await scan($)
  await offer($, 'scan-1')
  const res = (await report($, 'scan-1')) as { consumed?: string; text?: string }
  expect(res.consumed).toBe('azure-resources: scan recorded')
})
