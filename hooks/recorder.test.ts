import { expect, test } from 'claude-code/testing'
import { observeRun, recordFromCommand } from './recorder'
import { indexPath, readRows } from './index-store'

const ID = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.App/containerApps/web'
const ID2 = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/api'
const flush = async (n = 30) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}
const OUT = { exitCode: 0, stdout: '', stderr: '' }

function fakeHost(opts: { listOut?: unknown; runFails?: boolean; writeFails?: boolean } = {}) {
  const files = new Map<string, string>()
  const argvs: string[][] = []
  const tick = () => flush(3)
  const $ = {
    fs: {
      exists: async (p: string) => files.has(p),
      read: async (p: string) => {
        await tick()
        if (!files.has(p)) throw new Error('missing')
        return files.get(p)!
      },
      write: async (p: string, t: string) => {
        await tick()
        if (opts.writeFails) throw new Error('disk full')
        files.set(p, t)
      },
    },
    session: { cwd: async () => 'C:/proj' },
    process: {
      run: async (argv: readonly string[]) => {
        argvs.push([...argv])
        if (opts.runFails) throw new Error('boom')
        return { ...OUT, stdout: JSON.stringify(opts.listOut ?? []) }
      },
    },
  }
  return { $, files, argvs }
}

test('records an ids target without calling az', async () => {
  const h = fakeHost()
  await recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID}`, 'py')
  const rows = await readRows(h.$, 'C:/proj')
  expect(rows.length).toBe(1)
  expect(rows[0]!.name).toBe('web')
  expect(rows[0]!.type).toBe('Microsoft.App/containerApps')
  expect(rows[0]!.resourceGroup).toBe('rg')
  expect(rows[0]!.subscription).toBe('s1')
  expect(rows[0]!.source).toBe('hook')
  expect(h.argvs.length).toBe(0)
})

test('resolves a named target through resource list', async () => {
  const h = fakeHost({ listOut: [{ id: ID2, name: 'api', type: 'Microsoft.Web/sites', resourceGroup: 'rg' }] })
  await recordFromCommand(h.$, 'C:/proj', 'az webapp show --name api --resource-group rg', 'py')
  expect(h.argvs[0]!.slice(3)).toEqual(['resource', 'list', '--name', 'api', '--resource-group', 'rg', '-o', 'json'])
  const rows = await readRows(h.$, 'C:/proj')
  expect(rows.map((r) => r.id)).toEqual([ID2])
  expect(rows[0]!.subscription).toBe('s1')
})

test('ignores failed commands', async () => {
  const h = fakeHost()
  let recorded = 0
  const ran = { isError: true, result: 'x' }
  const out = await observeRun(h.$, `az resource show --ids ${ID}`, async () => ran, async () => { recorded++ })
  expect(out).toBe(ran)
  const denied = { deny: 'no' }
  await observeRun(h.$, `az resource show --ids ${ID}`, async () => denied, async () => { recorded++ })
  await flush()
  expect(recorded).toBe(0)
})

test('returns the tool result unchanged', async () => {
  const h = fakeHost()
  let recorded = 0
  const ran = { result: { stdout: 'ok' }, isError: false }
  const out = await observeRun(h.$, `az resource show --ids ${ID}`, async () => ran, async () => { recorded++ })
  expect(out).toBe(ran)
  await flush()
  expect(recorded).toBe(1)
})

test('two concurrent records both land in azure.md', async () => {
  const h = fakeHost()
  await Promise.all([
    recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID}`, 'py'),
    recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID2}`, 'py'),
  ])
  const rows = await readRows(h.$, 'C:/proj')
  expect(rows.map((r) => r.id).sort()).toEqual([ID, ID2].sort())
})

test('a recorder error does not surface', async () => {
  const h = fakeHost({ writeFails: true })
  await recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID}`, 'py')
  const bad = fakeHost({ runFails: true })
  await recordFromCommand(bad.$, 'C:/proj', 'az webapp show --name api --resource-group rg', 'py')
  const ran = { result: 'r', deny: undefined }
  const out = await observeRun(h.$, `az resource show --ids ${ID}`, async () => ran, async () => { throw new Error('x') })
  expect(out).toBe(ran)
  // the queue survives a failed write
  h.$.fs.write = async (p: string, t: string) => { h.files.set(p, t) }
  await recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID2}`, 'py')
  expect((await readRows(h.$, 'C:/proj')).length).toBe(1)
})

test('indexPath keeps the separator style of the cwd', async () => {
  const bs = String.fromCharCode(92)
  expect(indexPath(`C:${bs}proj${bs}`)).toBe(`C:${bs}proj${bs}azure.md`)
  expect(indexPath('/home/p/')).toBe('/home/p/azure.md')
})

test('an ids target that is not a strict ARM id is not recorded', async () => {
  const h = fakeHost()
  await recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${ID}%2Fx`, 'py')
  expect((await readRows(h.$, 'C:/proj')).length).toBe(0)
})

test('a repeated identical named command calls az once', async () => {
  const h = fakeHost({ listOut: [] })
  await recordFromCommand(h.$, 'C:/proj', 'az webapp show --name rep1 --resource-group rg', 'py')
  await recordFromCommand(h.$, 'C:/proj', 'az webapp show --name rep1 --resource-group rg', 'py')
  expect(h.argvs.length).toBe(1)
})

test('a named target already in azure.md calls no az', async () => {
  const h = fakeHost()
  const known = '/subscriptions/s1/resourceGroups/rgk/providers/Microsoft.Web/sites/known1'
  await recordFromCommand(h.$, 'C:/proj', `az resource show --ids ${known}`, 'py')
  await recordFromCommand(h.$, 'C:/proj', 'az webapp show --name KNOWN1 --resource-group rgk', 'py')
  expect(h.argvs.length).toBe(0)
})

test('at most 5 targets per command are resolved', async () => {
  const h = fakeHost({ listOut: [] })
  const line = Array.from({ length: 8 }, (_, i) => `az webapp show -n cap${i} -g rg8`).join('; ')
  await recordFromCommand(h.$, 'C:/proj', line, 'py')
  expect(h.argvs.length).toBe(5)
})

test('a non-az command asks nothing of the session', async () => {
  const h = fakeHost()
  let cwdCalls = 0
  let recorded = 0
  h.$.session.cwd = async () => (cwdCalls++, 'C:/proj')
  const ran = { result: 'ok' }
  expect(await observeRun(h.$, 'ls -la && git status', async () => ran, async () => { recorded++ })).toBe(ran)
  await flush()
  expect(cwdCalls).toBe(0)
  expect(recorded).toBe(0)
})

test('only one resource list runs at a time', async () => {
  const h = fakeHost()
  let active = 0
  let peak = 0
  h.$.process.run = async (argv: readonly string[]) => {
    h.argvs.push([...argv])
    active++
    peak = Math.max(peak, active)
    await flush(5)
    active--
    return { ...OUT, stdout: '[]' }
  }
  await Promise.all(['one1', 'one2', 'one3'].map((n) => recordFromCommand(h.$, 'C:/proj', `az webapp show -n ${n} -g rg1`, 'py')))
  expect(h.argvs.length).toBe(3)
  expect(peak).toBe(1)
})
