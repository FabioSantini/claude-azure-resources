// The scan's lifecycle: start, busy, end, Update, report_resources.
import { expect, test } from 'claude-code/testing'
import { scannerPrompt } from './scan'
import { BUSY, ID, REPORT, SCANNER, STARTED, SUB, call, complete, indexWith, isDenied, offer, report, scan, scanWhenFree, seeAndReport, stage, start, until, type Res, type StageOpts } from './scan-test-kit'

const idIn = (n: number) => `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/app${n}`
const APP = `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.App/containerApps/web`

const scanning = async ($: any, on: any, opts: StageOpts = {}) => {
  const s = stage(on, opts)
  await start($)
  const res = await scan($)
  // The engine offers the scanner its tools before its first call.
  if (!opts.spawnDeny) await offer($, 'scan-1')
  return { ...s, res }
}

test('azure-scan spawns the scanner with the known groups', async ($, on) => {
  const s = await scanning($, on, { file: indexWith(['rg-demo']) })
  expect(s.res.text).toBe(STARTED)
  expect(s.spawns.length).toBe(1)
  expect(s.spawns[0]!.subagent_type ?? s.spawns[0]!.subagentType).toBe(SCANNER)
  expect(s.spawns[0]!.prompt).toBe('Project folder: C:/proj. Resource groups already known: rg-demo.')
})

test('groups the guard would refuse are left out of the prompt', async ($, on) => {
  const s = await scanning($, on, { file: indexWith(['(x)', 'rg-ok', '-o', 'a b']) })
  expect(s.spawns[0]!.prompt).toBe('Project folder: C:/proj. Resource groups already known: rg-ok.')
})

test('a spawn that answers no id keeps busy until the scanner reports', async ($, on) => {
  const s = await scanning($, on)
  expect(s.res.text).toBe(STARTED)
  expect((await scan($)).text).toBe(BUSY)
  expect(s.spawns.length).toBe(1)
})

test('turn.complete alone does not end the scan', async ($, on) => {
  await scanning($, on)
  await complete($, 'scan-1')
  expect((await scan($)).text).toBe(BUSY)
})

test('agent.report ends the scan and runs Update', async ($, on) => {
  const s = await scanning($, on, { file: indexWith(['rg']) })
  await report($, 'scan-1')
  await until(() => s.argvs.length > 0)
  expect(s.argvs.some((a) => a.includes('show') && a.includes(`${ID}0`))).toBe(true)
  expect(await scanWhenFree($)).toBe(STARTED)
})

test('a stopped scanner frees the busy state', async ($, on) => {
  const s = await scanning($, on)
  await report($, 'scan-1', 'stopped')
  expect(await scanWhenFree($)).toBe(STARTED)
  expect(s.spawns.length).toBe(2)
})

test('a scanner that ends before its spawn answers frees the busy state', async ($, on) => {
  const s = await scanning($, on, { during: async () => void (await report($, 'scan-1')) })
  expect(s.res.text).toBe(STARTED)
  expect(await scanWhenFree($)).toBe(STARTED)
  expect(s.spawns.length).toBe(2)
})

test('a failed spawn frees the busy state', async ($, on) => {
  const s = await scanning($, on, { spawnDeny: true })
  expect(s.res.text).toBe('Azure resources: scan could not start.')
  expect((await scan($)).text).toBe('Azure resources: scan could not start.')
  expect(s.spawns.length).toBe(2)
})

test('report_resources from the main chat is denied', async ($, on) => {
  const s = await scanning($, on)
  const r = await call($, { tool: REPORT, rows: [{ id: ID }] })
  expect(isDenied(r)).toBe(true)
  expect(s.files.has('C:/proj/azure.md')).toBe(false)
})

test('report_resources writes agent rows, every field from the id', async ($, on) => {
  const s = await scanning($, on)
  const rows = [{ id: APP, name: 'ConnectionString=leak', type: 'x', resourceGroup: 'y', subscription: 'z' }, { id: 'not-an-id' }, { id: 7 }]
  const r: Res = await seeAndReport($, rows)
  expect(isDenied(r)).toBe(false)
  expect(r.result).toBe('Recorded 1 rows.')
  const text = s.files.get('C:/proj/azure.md')!
  expect(text).toContain(`| ${APP} | web | Microsoft.App/containerApps | rg | ${SUB} | agent |`)
  expect(text).not.toContain('leak')
  expect(text).not.toContain('not-an-id')
})

test('report_resources drops ids the scanner did not get from its own az call', async ($, on) => {
  const s = await scanning($, on)
  const r: Res = await seeAndReport($, [{ id: APP }, { id: idIn(1) }], 'scan-1', [idIn(1)])
  expect(r.result).toBe('Recorded 1 rows.')
  expect(s.files.get('C:/proj/azure.md')!).not.toContain(APP)
  expect((await call($, { tool: REPORT, rows: [{ id: APP }], agentId: 'scan-1' })).result).toBe('Recorded 0 rows.')
})

test('ids seen in a scan are forgotten when it ends', async ($, on) => {
  stage(on)
  await start($)
  await scan($)
  await offer($, 'scan-1')
  await seeAndReport($, [{ id: APP }])
  await report($, 'scan-1')
  await until(async () => (await scan($)).text === STARTED)
  await offer($, 'scan-1')
  expect((await call($, { tool: REPORT, rows: [{ id: APP }], agentId: 'scan-1' })).result).toBe('Recorded 0 rows.')
})

test('report_resources caps at 500 rows', async ($, on) => {
  const s = await scanning($, on)
  const rows = Array.from({ length: 600 }, (_, i) => ({ id: idIn(i) }))
  const r = await seeAndReport($, rows)
  expect(r.result).toBe('Recorded 500 rows.')
  expect(s.files.get('C:/proj/azure.md')!).not.toContain(idIn(500))
})

test('the prompt names the groups or says none', () => {
  expect(scannerPrompt('C:/p', [])).toBe('Project folder: C:/p. Resource groups already known: none.')
  expect(scannerPrompt('C:/p', ['a', 'b'])).toBe('Project folder: C:/p. Resource groups already known: a, b.')
  expect(scannerPrompt('C:/p', ['a'], [])).toBe('Project folder: C:/p. Resource groups already known: a.')
})

test('the prompt lists the memory tools only when configured', () => {
  expect(scannerPrompt('C:/p', [], ['mcp__m__search', 'mcp__m__list'])).toBe(
    'Project folder: C:/p. Resource groups already known: none. Memory tools you may use: mcp__m__search, mcp__m__list.',
  )
})

const NO_FOLDER = 'Azure resources: open a project folder to scan.'

const refused: [string, Record<string, string>][] = [
  ['C:/Users/me', { USERPROFILE: 'C:/Users/me' }],
  ['c:/users/ME/', { USERPROFILE: 'C:/Users/me' }],
  ['/home/me', { HOME: '/home/me' }],
  ['C:/', {}],
  ['D:', {}],
  ['/', {}],
  ['//server/share', {}],
  ['C:/Users', { USERPROFILE: 'C:/Users/me' }],
  ['/home', { HOME: '/home/me' }],
  ['/home', {}],
  ['/Users', {}],
  ['D:/Users', {}],
  ['d:/users/', {}],
  ['C:/data', { USERPROFILE: 'C:/data/home/me' }],
  ['C:/Users/me/.claude/x', { USERPROFILE: 'C:/Users/me' }],
  ['/home/me/.claude/x', { HOME: '/home/me' }],
  ['C:/p/.config', {}],
  ['C:/p/.GIT/sub', {}],
  ['C:/p/vault', {}],
  ['C:/p/.claude./x', {}],
  ['C:/p/.SSH /x', {}],
  ['C:/p/./.config', {}],
]
for (const [cwd, env] of refused) {
  test(`a scan of ${cwd} (home or a root; env ${Object.keys(env).join(",") || "none"}) is refused`, async ($, on) => {
    const s = stage(on, { cwd, env })
    await start($)
    expect((await scan($)).text).toBe(NO_FOLDER)
    expect(s.spawns.length).toBe(0)
  })
}

test('a folder with no secret segment scans', async ($, on) => {
  const s = stage(on, { cwd: 'C:/p/app' })
  await start($)
  expect((await scan($)).text).toBe(STARTED)
  expect(s.spawns.length).toBe(1)
})

test('a project folder that is a link into a secret folder is refused', async ($, on) => {
  const s = stage(on, { cwd: 'C:/p/app' })
  s.links.set('C:/p/app', 'C:/p/.ssh')
  await start($)
  expect((await scan($)).text).toBe(NO_FOLDER)
  expect(s.spawns.length).toBe(0)
})

test('a sibling of home that only shares its prefix scans', async ($, on) => {
  const s = stage(on, { cwd: 'C:/Users/me2', env: { USERPROFILE: 'C:/Users/me' } })
  await start($)
  expect((await scan($)).text).toBe(STARTED)
  expect(s.spawns.length).toBe(1)
})

test('a project folder below home scans', async ($, on) => {
  const s = stage(on, { cwd: 'C:/Users/me/proj', env: { USERPROFILE: 'C:/Users/me', HOME: 'C:/Users/me' } })
  await start($)
  expect((await scan($)).text).toBe(STARTED)
  expect(s.spawns.length).toBe(1)
})

test('a project folder that is a link to home is refused', async ($, on) => {
  const s = stage(on, { env: { USERPROFILE: 'C:/Users/me' } })
  s.links.set('C:/proj', 'C:/Users/me')
  await start($)
  expect((await scan($)).text).toBe(NO_FOLDER)
  expect(s.spawns.length).toBe(0)
})
