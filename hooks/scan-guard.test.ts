// The scanner's guard as the engine runs it: which calls of which agents pass.
import { expect, test } from 'claude-code/testing'
import { REPORT, SCANNER, bash, call, isDenied, offer, report, scan, stage, start, type Res } from './scan-test-kit'

const scanner = async ($: any, on: any) => {
  const s = stage(on)
  await start($)
  await scan($)
  await offer($, 'scan-1')
  return s
}

test('agent Bash is denied when not allowed', async ($, on) => {
  const s = await scanner($, on)
  for (const c of ['az keyvault secret show -n a', 'rm -rf x', 'az group list & rm x']) {
    expect(isDenied(await bash($, c, 'scan-1'))).toBe(true)
  }
  expect(s.passed.length).toBe(0)
})

test('agent Bash in the allowed form runs', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await bash($, 'az resource list -g rg-demo -o json', 'scan-1'))).toBe(false)
  expect(s.passed.map((p) => p.command)).toEqual(['az resource list -g rg-demo -o json'])
})

test('main-session Bash is not affected by the guard', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await bash($, 'rm -rf x'))).toBe(false)
  expect(isDenied(await bash($, 'az keyvault secret show -n a', 'other-agent'))).toBe(false)
  expect(s.passed.length).toBe(2)
})

test('scanner PowerShell and Write are denied', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await call($, { tool: 'PowerShell', command: 'az group list', agentId: 'scan-1' }))).toBe(true)
  expect(isDenied(await call($, { tool: 'Write', file_path: 'C:/x.txt', content: 'x', agentId: 'scan-1' }))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('an agent of the scanner type the mod never spawned is guarded from its first offer', async ($, on) => {
  const s = stage(on)
  await start($)
  await offer($, 'x')
  expect(isDenied(await bash($, 'rm -rf x', 'x'))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('the scanner is offered its own tools only; report_resources only to the scanner', async ($, on) => {
  stage(on)
  await start($)
  expect((await offer($, 'x', 'Bash')).isOffered).toBe(true)
  expect((await offer($, 'x', REPORT)).isOffered).toBe(true)
  expect((await offer($, 'x', 'PowerShell')).isOffered).toBe(false)
  expect((await offer($, 'x', 'Write')).isOffered).toBe(false)
  expect((await offer($, 'o', 'PowerShell', 'Explore')).isOffered).toBe(true)
  expect((await offer($, 'o', REPORT, 'Explore')).isOffered).toBe(false)
  const main = await ($ as any).tool.offer({ tool: REPORT, provider: { plugin: 'engine', tier: 'core' } })
  expect(main.isOffered).toBe(false)
})

test('a spawn of the scanner type guards its id', async ($, on) => {
  stage(on)
  await start($)
  const r: Res = await ($ as any).agent.spawn({ subagentType: SCANNER, prompt: 'p' })
  expect(r.agentId).toBe('scan-1')
  expect(isDenied(await bash($, 'rm -rf x', 'scan-1'))).toBe(true)
})

test('a scanner call made while its spawn is in flight waits and is denied', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>((r) => (release = r))
  const s = stage(on, { during: () => gate })
  await start($)
  const spawning = ($ as any).agent.spawn({ subagentType: SCANNER, prompt: 'p' })
  const calling = bash($, 'rm -rf x', 'scan-1')
  release()
  await spawning
  expect(isDenied(await calling)).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('a fork of a scanner is refused; other forks pass', async ($, on) => {
  stage(on)
  await start($)
  await offer($, 'scan-1')
  const fork: Res = await ($ as any).agent.spawn({ subagentType: 'fork', parentAgentId: 'scan-1', prompt: 'p' })
  expect(fork.deny).toBeDefined()
  const other: Res = await ($ as any).agent.spawn({ subagentType: 'fork', parentAgentId: 'someone', prompt: 'p' })
  expect(other.deny).toBeUndefined()
})

test('scanner is not offered to the main chat', async ($, on) => {
  stage(on)
  await start($)
  const r = await ($ as any).agent.offer({ agent: SCANNER, description: 'x', source: 'plugin', provider: { plugin: 'azure-resources', tier: 'user' } })
  expect(r.isOffered).toBe(false)
})

const readAs = ($: any, file_path: string, agentId?: string) => call($, { tool: 'Read', file_path, ...(agentId ? { agentId } : {}) })

test('scanner Read inside the project passes; outside or of a secret is denied', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await readAs($, 'C:/proj/CLAUDE.md', 'scan-1'))).toBe(false)
  for (const p of ['C:/proj/.env', 'C:/proj/sub/.env.local', 'C:/proj/certs/a.pem', 'C:/proj/../x.txt', 'C:/Windows/win.ini', 'C:/proj/.git/config']) {
    expect(isDenied(await readAs($, p, 'scan-1'))).toBe(true)
  }
  expect(s.passed.length).toBe(1)
})

test('scanner Grep is denied in every mode and not offered', async ($, on) => {
  const s = await scanner($, on)
  for (const mode of [undefined, 'content', 'files_with_matches', 'count']) {
    const input = { tool: 'Grep', pattern: 'x', ...(mode ? { output_mode: mode } : {}), agentId: 'scan-1' }
    expect(isDenied(await call($, input))).toBe(true)
  }
  expect((await offer($, 'scan-1', 'Grep')).isOffered).toBe(false)
  expect(s.passed.length).toBe(0)
})

test('scanner Glob outside the project is denied', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '*', path: 'C:/', agentId: 'scan-1' }))).toBe(true)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '**/*.bicep', agentId: 'scan-1' }))).toBe(true)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '../*', path: 'C:/proj', agentId: 'scan-1' }))).toBe(true)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '*', path: 'C:/proj/.git', agentId: 'scan-1' }))).toBe(true)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '**/*.bicep', path: 'C:/proj', agentId: 'scan-1' }))).toBe(false)
  expect(s.passed.length).toBe(1)
})

test('scanner Glob through a linked folder is judged where it lands', async ($, on) => {
  const s = await scanner($, on)
  s.links.set('C:/proj/out', 'C:/Users/u')
  expect(isDenied(await call($, { tool: 'Glob', pattern: '*', path: 'C:/proj/out', agentId: 'scan-1' }))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('scanner relative Read is denied', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await readAs($, 'CLAUDE.md', 'scan-1'))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('with no scan started, every scanner file call is denied', async ($, on) => {
  const s = stage(on)
  await start($)
  await offer($, 'x')
  expect(isDenied(await readAs($, 'C:/proj/CLAUDE.md', 'x'))).toBe(true)
  expect(isDenied(await call($, { tool: 'Glob', pattern: '*', path: 'C:/proj', agentId: 'x' }))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('once the scan ends, the scanner file calls are denied', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await readAs($, 'C:/proj/CLAUDE.md', 'scan-1'))).toBe(false)
  await report($, 'scan-1')
  expect(isDenied(await readAs($, 'C:/proj/CLAUDE.md', 'scan-1'))).toBe(true)
  expect(s.passed.length).toBe(1)
})

test('a scan that fails to start leaves no project folder', async ($, on) => {
  const s = stage(on, { spawnDeny: true })
  await start($)
  await scan($)
  await offer($, 'x')
  expect(isDenied(await readAs($, 'C:/proj/CLAUDE.md', 'x'))).toBe(true)
  expect(s.passed.length).toBe(0)
})

test('an unconfigured memory tool is denied and not offered', async ($, on) => {
  const s = await scanner($, on)
  const tool = 'mcp__my-memory__memory_search'
  expect(isDenied(await call($, { tool, query: 'azure', agentId: 'scan-1' }))).toBe(true)
  expect((await offer($, 'scan-1', tool)).isOffered).toBe(false)
  expect(s.passed.length).toBe(0)
})

test('a configured memory tool is offered and allowed', { options: { memoryTools: 'mcp__my-memory__memory_search' } }, async ($, on) => {
  const s = await scanner($, on)
  const tool = 'mcp__my-memory__memory_search'
  expect((await offer($, 'scan-1', tool)).isOffered).toBe(true)
  expect(isDenied(await call($, { tool, query: 'azure', agentId: 'scan-1' }))).toBe(false)
  expect(isDenied(await call($, { tool: 'mcp__my-memory__memory_store', agentId: 'scan-1' }))).toBe(true)
  expect(s.passed.length).toBe(1)
})

test('the scan task names configured memory tools', { options: { memoryTools: 'mcp__my-memory__memory_search' } }, async ($, on) => {
  const s = await scanner($, on)
  expect(s.spawns[0]!.prompt).toContain('Memory tools you may use: mcp__my-memory__memory_search.')
})

test('the scan task names no memory tools when none are configured', async ($, on) => {
  const s = await scanner($, on)
  expect(s.spawns[0]!.prompt).not.toContain('Memory tools')
})

test('main-chat Read is not affected by the guard', async ($, on) => {
  const s = await scanner($, on)
  expect(isDenied(await readAs($, 'C:/Windows/win.ini'))).toBe(false)
  expect(isDenied(await readAs($, 'C:/proj/.env', 'other-agent'))).toBe(false)
  expect(s.passed.length).toBe(2)
})

test('scanner Read through a link is judged where it lands', async ($, on) => {
  const s = await scanner($, on)
  s.links.set('C:/proj/docs/win.md', 'C:/Windows/win.ini')
  s.links.set('C:/proj/docs/conf.md', 'C:/proj/.env')
  s.links.set('C:/proj/docs/ok.md', 'C:/proj/infra/main.bicep')
  expect(isDenied(await readAs($, 'C:/proj/docs/win.md', 'scan-1'))).toBe(true)
  expect(isDenied(await readAs($, 'C:/proj/docs/conf.md', 'scan-1'))).toBe(true)
  expect(isDenied(await readAs($, 'C:/proj/docs/ok.md', 'scan-1'))).toBe(false)
  s.missing.add('C:/proj/gone.md')
  expect(isDenied(await readAs($, 'C:/proj/gone.md', 'scan-1'))).toBe(true)
  expect(s.passed.length).toBe(1)
})
