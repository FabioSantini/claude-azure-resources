// The mod's userConfig values, checked: a bad value falls back to the manifest's default.
export const DEFAULT_AZ_PYTHON = 'C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\python.exe'
export const DEFAULT_PARALLEL = 4
const MIN_PARALLEL = 1
const MAX_PARALLEL = 8
// An MCP tool name and nothing else: mcp__<server>__<tool>.
const MCP_TOOL = /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/
const MAX_MEMORY_TOOLS = 5
// A tool whose name says it writes, changes or runs something: never given to the scanner (judged on the tool part).
const WRITE_VERB = /store|write|update|delete|create|set|add|remove|put|post|send|exec|run|upsert|ingest|harvest|cleanup|consolidate/i

/** The part of mcp__<server>__<tool> after the server: everything after the first '__' that follows 'mcp__'. */
const toolPart = (name: string): string => name.slice(name.indexOf('__', 5) + 2)
// Only tools whose name says they read: an allow-list on the tool part, the write verbs still refused on top.
const READ_TOOL = /^(memory_)?(search|list|get|read|find|query|recall|view|detail|explore)(_|$)/i
// A tool or server whose name speaks of secrets or identity: never given to the scanner, even when it only reads.
const SECRET_WORD = /secret|key|token|password|passwd|pwd|credential|cert|vault|auth|bearer|jwt|sas|private|pem|identity|principal/i
const isReadTool = (name: string): boolean => {
  const tool = toolPart(name)
  return READ_TOOL.test(tool) && !WRITE_VERB.test(tool) && !SECRET_WORD.test(name)
}

export type Options = { azPython: string; parallel: number; memoryTools: readonly string[] }

function parallelOf(v: unknown): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return DEFAULT_PARALLEL
  return Math.min(MAX_PARALLEL, Math.max(MIN_PARALLEL, Math.floor(v)))
}

/** The memory tools the scanner may call: valid MCP tool names only, deduped, at most 5. */
function memoryToolsOf(v: unknown): string[] {
  if (typeof v !== 'string') return []
  const names = v.split(',').map((s) => s.trim()).filter((s) => MCP_TOOL.test(s) && isReadTool(s))
  return [...new Set(names)].slice(0, MAX_MEMORY_TOOLS)
}

export function readOptions(options: Readonly<Record<string, unknown>>): Options {
  const py = options.azPython
  return {
    azPython: typeof py === 'string' && py.trim() !== '' ? py : DEFAULT_AZ_PYTHON,
    parallel: parallelOf(options.refreshParallel),
    memoryTools: memoryToolsOf(options.memoryTools),
  }
}
