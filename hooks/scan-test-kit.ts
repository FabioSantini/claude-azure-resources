// Shared staging for the scan tests: what sits beneath the mod in the engine's test kit.
import { mergeRows, renderIndex } from './index-file'

export const SCANNER = 'azure-resources:scanner'
export const REPORT = 'mcp__azure-resources__report_resources'
export const ID = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.App/containerApps/web'
export const PROVIDER = { plugin: 'azure-resources', tier: 'user' }
export const BUSY = 'Azure resources: busy, try again shortly.'
export const STARTED = 'Azure resources: scan started.'

export const indexWith = (groups: string[]) =>
  renderIndex({
    before: '',
    after: '',
    badRows: [],
    rows: mergeRows(
      [],
      groups.map((g, i) => ({ id: `${ID}${i}`, name: 'web', type: 'Microsoft.App/containerApps', resourceGroup: g, subscription: 's1', source: 'hook' as const })),
      '2026-11-23T10:00:00Z',
    ),
  })

export type Res = { deny?: string; isError?: boolean; text?: string; result?: unknown; agentId?: string }
export const isDenied = (r: Res) => r.deny !== undefined || r.isError === true

type SpawnIn = { subagentType?: string; subagent_type?: string; prompt: string }
export type StageOpts = {
  spawnDeny?: boolean
  file?: string
  /** Runs inside the spawn, before it answers (a gate, or the agent's end). */
  during?: ($: any, e: SpawnIn) => Promise<void>
  /** Every az call hangs (never answers). */
  hangRuns?: boolean
  /** The session folder (default C:/proj). */
  cwd?: string
  /** What $.env.get answers, by name. */
  env?: Record<string, string>
}

/** A subscription id for ids the scanner reports (report_resources wants a GUID). */
export const SUB = '00000000-0000-0000-0000-000000000000'
// What the scanner's `az resource list` answers in this test: set by seeAndReport.
let azIds: string[] = []

function stageFiles(on: any, file?: string): Map<string, string> {
  const files = new Map<string, string>(file ? [['C:/proj/azure.md', file]] : [])
  // The kit hands paths over with backslashes; keys are kept with forward slashes.
  const key = (p: string) => p.replace(/\\/g, '/')
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', (_: unknown, e: { path: string; text: string }) => (files.set(key(e.path), e.text), { value: undefined }))
  return files
}

/** Where a path lands: itself unless a test linked it elsewhere; a missing path lands nowhere (no realPath). */
function stageLinks(on: any): { links: Map<string, string>; missing: Set<string> } {
  const links = new Map<string, string>()
  const missing = new Set<string>()
  const key = (p: string) => p.split(String.fromCharCode(92)).join('/')
  on('fs.stat', (_: unknown, e: { path: string }) => {
    const p = key(e.path)
    const base = { kind: 'file', size: 1, mtimeMs: 0, isLink: links.has(p) }
    return { value: missing.has(p) ? base : { ...base, realPath: links.get(p) ?? p } }
  })
  return { links, missing }
}

function stageEngine(on: any, opts: StageOpts): void {
  on('command.register', () => ({ value: { command: 'x' } }))
  on('agent.register', () => ({ value: { agent: SCANNER } }))
  on('tool.register', () => ({ value: { tool: REPORT } }))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.report', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('tool.offer', () => ({ isOffered: true }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: opts.cwd ?? 'C:/proj' }))
  on('env.get', (_: unknown, e: { name: string }) => ({ value: opts.env?.[e.name] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
}

export function stage(on: any, opts: StageOpts = {}) {
  const spawns: SpawnIn[] = []
  const passed: { tool: string; command?: string; agentId?: string }[] = []
  const argvs: string[][] = []
  azIds = []
  stageEngine(on, opts)
  const files = stageFiles(on, opts.file)
  const { links, missing } = stageLinks(on)
  // A plugin's own spawn loses this agentId in the kit; a spawn the test makes keeps it.
  on('agent.spawn', async ($: any, e: SpawnIn) => {
    spawns.push(e)
    if (opts.during) await opts.during($, e)
    return opts.spawnDeny ? { deny: 'no agents here' } : { model: 'sonnet', agentId: 'scan-1' }
  })
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    argvs.push([...e.argv])
    if (opts.hangRuns) return new Promise(() => undefined)
    return { value: { exitCode: 0, stderr: '', stdout: JSON.stringify({ id: ID, location: 'italynorth' }) } }
  })
  on('tool.call', (_: unknown, e: { tool: string; command?: string; agentId?: string }) => {
    passed.push({ tool: e.tool, command: e.command, agentId: e.agentId })
    if (e.tool !== 'Bash' || !e.command?.startsWith('az resource list')) return { result: 'ran' }
    return { result: { stdout: JSON.stringify(azIds.map((id) => ({ id }))), stderr: '', interrupted: false } }
  })
  return { files, spawns, passed, argvs, links, missing }
}

// Calls go through `any`: the kit's typed overloads are costly to type-check.
export const call = ($: any, input: object): Promise<Res> => $.tool.call(input)
export const bash = ($: any, command: string, agentId?: string): Promise<Res> => call($, { tool: 'Bash', command, ...(agentId ? { agentId } : {}) })
export const start = ($: any) => $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
export const scan = ($: any): Promise<{ text: string }> => $.command.run({ command: 'azure-scan', args: '' })
/** The engine asks tool.offer of a loop's tool before the call: here for an agent of the given type. */
export const offer = ($: any, agentId: string, tool = 'Bash', subagentType = SCANNER): Promise<{ isOffered: boolean }> =>
  $.tool.offer({ tool, provider: { plugin: 'engine', tier: 'core' }, agentId, subagentType })
/** The scanner lists the rows' ids with its own az call, then reports the rows. */
export async function seeAndReport($: any, rows: { id: unknown }[], agentId = 'scan-1', seen?: string[]): Promise<Res> {
  azIds = seen ?? rows.map((r) => r.id).filter((id): id is string => typeof id === 'string')
  await bash($, 'az resource list -g rg -o json', agentId)
  return call($, { tool: REPORT, rows, agentId })
}
export const report = ($: any, agentId: string, status = 'completed') =>
  $.agent.report({ agentId, subagentType: SCANNER, provider: PROVIDER, status, text: '' })
export const complete = ($: any, agentId: string) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId })

const timer = globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }
/** The scanner's end is handled in the background: wait for its effect. */
export const until = async (ok: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await ok()); i++) await new Promise<void>((r) => timer.setTimeout(r, 5))
}
export const scanWhenFree = async ($: any) => {
  let text = ''
  await until(async () => (text = (await scan($)).text) !== BUSY)
  return text
}
