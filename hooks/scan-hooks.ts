// Hooks of the scan: registration, the scanner's guard, report_resources and the scanner's end.
import type { Register } from 'claude-code'
import { isAllowedAgentCommand, isScannerTool, REPORT_TOOL } from './agent-guard'
import { isOpenable, isReadable, judgeFileCall } from './file-guard'
import { judgeRealPath, type StatFn } from './real-read'
import { addRows } from './index-store'
import { showNewRows } from './new-rows'
import { agentRows } from './report'
import { rememberIds, seenIds } from './seen-ids'
import { reportSpec, scannerSpecFor, SCANNER_TYPE, type ScannerSpec } from './scan-spec'
import { adopt, adoptListed, configureScan, finishScan, isGuarded, mayBeScanner, scanFolder, scanMemoryTools, scanToolSet, settleSpawns, trackSpawn, type ScanHost, type ScanOpts } from './scan'

type On = Parameters<Register>[0]
type Deny = { deny: string }

const GUARD_FAILED = 'azure-resources: guard failed'
const SCAN_RECORDED = 'azure-resources: scan recorded'

type Input = Readonly<Record<string, unknown>>
const BASH_ONLY = 'azure-resources: the scanner may run only az resource list, az group list or az account show, one per call, in the allowed form.'

const NO_SCAN = 'azure-resources: the scanner may use files only while its scan runs.'

/** A scanner's Read or Glob: only while a scan holds its project folder, inside it by spelling and where it lands. */
async function fileDeny(tool: string, input: Input, stat: StatFn): Promise<string | undefined> {
  const cwd = scanFolder()
  if (cwd === undefined) return NO_SCAN
  const lexical = judgeFileCall(tool, input, cwd)
  if (lexical !== undefined) return lexical
  const isRead = tool === 'Read'
  return judgeRealPath(String(isRead ? input.file_path : input.path), cwd, stat, isRead ? isReadable : isOpenable)
}

/** Why the scanner may not make this call, or undefined: its tool on the list, Bash in the allowed form, files inside. */
async function scannerDeny(tool: string, input: Input, stat: StatFn): Promise<string | undefined> {
  if (!isScannerTool(tool, scanToolSet())) return `azure-resources: the scanner may not use ${tool}.`
  if (tool === 'Bash') return isAllowedAgentCommand(typeof input.command === 'string' ? input.command : '') ? undefined : BASH_ONLY
  if (tool === 'Read' || tool === 'Glob') return fileDeny(tool, input, stat)
  return undefined
}

/** The scanner's call: refused with the reason scannerDeny gives; any other agent's call passes. */
async function judgeScanner<R>(e: Input & { tool: string }, agentId: string, stat: StatFn, pass: () => Promise<R>): Promise<R | Deny> {
  if (!isGuarded(agentId)) {
    await settleSpawns()
    if (!isGuarded(agentId)) return pass()
  }
  const deny = await scannerDeny(e.tool, e, stat)
  if (deny !== undefined) return { deny }
  const answer = await pass()
  // The ids az returned are the only ones report_resources will take.
  if (e.tool === 'Bash') rememberIds(answer)
  return answer
}

function registerGuard(on: On): void {
  on('tool.call', ($, e, next) => {
    const id = e.agentId
    // Not a scanner: straight through, no work (this hook hears every tool call).
    if (id === undefined || !mayBeScanner(id)) return next(e)
    const stat: StatFn = (path) => $.fs.stat(path, { resolve: true })
    return judgeScanner(e as unknown as Input & { tool: string }, id, stat, () => next(e))
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))
}

function registerReport(on: On, opts: ScanOpts): void {
  on('tool.call', { tool: REPORT_TOOL }, async ($, e) => {
    if (e.agentId === undefined || !isGuarded(e.agentId)) return { deny: 'azure-resources: report_resources is for the scan agent only.' }
    const rows = agentRows((e as { rows?: unknown }).rows, seenIds())
    if (rows.length > 0) {
      const cwd = await $.session.cwd()
      // Shown now and refreshed in the background, not only at the scan's end.
      await showNewRows($, cwd, await addRows($, cwd, rows), opts)
    }
    return { result: `Recorded ${rows.length} rows.` }
  }).catch(() => ({ deny: 'azure-resources: report_resources failed.' }))
}

// The engine asks tool.offer of each tool before the loop's first request and again at each call, before
// tool.call: an agent of the scanner type is guarded from there, whether or not its spawn was seen.
function registerOffers(on: On): void {
  on('agent.offer', { agent: SCANNER_TYPE }, () => ({ isOffered: false })).catch(() => ({ isOffered: false }))
  on('tool.offer', ($, e, next) => {
    if (e.subagentType === SCANNER_TYPE) {
      adopt(e.agentId)
      return { isOffered: isScannerTool(e.tool, scanToolSet()) }
    }
    if (e.tool === REPORT_TOOL) return { isOffered: false }
    return next(e)
  }).catch(($, e, next) =>
    next.called || (e.subagentType !== SCANNER_TYPE && e.tool !== REPORT_TOOL) ? next(e) : { isOffered: false },
  )
}

function registerSpawns(on: On): void {
  // Every spawn of the type, whoever makes it, is guarded; a spawn this hook could not track is refused.
  on('agent.spawn', { subagentType: SCANNER_TYPE }, ($, e, next) => {
    adopt(e.resume?.agentId)
    return trackSpawn(() => next(e))
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'azure-resources: the scanner could not be tracked.' }))
  // A fork copies its parent's tools and prompt: a fork of a scanner is refused.
  const forksScanner = (parent: string | undefined) => parent !== undefined && isGuarded(parent)
  on('agent.spawn', { subagentType: 'fork' }, ($, e, next) =>
    forksScanner(e.parentAgentId) ? { deny: 'azure-resources: a scanner cannot be forked.' } : next(e),
  ).catch(($, e, next) => (next.called || !forksScanner(e.parentAgentId) ? next(e) : { deny: 'azure-resources: a scanner cannot be forked.' }))
  // The end of a scanner's run (completed, failed or stopped) ends the scan. Its report is consumed:
  // the rows are in azure.md and the pane, so the main chat is not woken for it.
  on('agent.report', { subagentType: SCANNER_TYPE }, async ($, e, next) => {
    void finishScan($, e.agentId).catch(() => undefined)
    await next(e)
    return { consumed: SCAN_RECORDED }
  }).catch(($, e, next) => (next.called ? { consumed: SCAN_RECORDED } : next(e)))
}

type StartHost = ScanHost & {
  agent: { register: (spec: ScannerSpec) => Promise<unknown> }
  tool: { register: (spec: typeof reportSpec) => Promise<unknown> }
}

/** Called from the mod's one session.start hook. Each step on its own: one failing skips no other.
 * The registrations are awaited; adopting listed scanners runs in the background, never delaying the start. */
export async function scanSessionStart($: StartHost): Promise<void> {
  await $.agent.register(scannerSpecFor(scanMemoryTools())).catch(() => undefined)
  await $.tool.register(reportSpec).catch(() => undefined)
  void Promise.resolve()
    .then(() => adoptListed($))
    .catch(() => undefined)
}

export function registerScan(on: On, opts: ScanOpts): void {
  configureScan(opts)
  registerGuard(on)
  registerReport(on, opts)
  registerOffers(on)
  registerSpawns(on)
}
