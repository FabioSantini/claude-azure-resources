// What the scan agent may run: a strict whole-line allowlist, read-only az calls only.
import { hasShellMeta } from './az-parse'

export const REPORT_TOOL = 'mcp__azure-resources__report_resources'

/** The tools every scanner is given; configured memory tools are added to them (the engine enforces the list too). */
export const BASE_SCANNER_TOOLS = ['Bash', 'Read', 'Glob', REPORT_TOOL] as const

/** The scanner agent type's tools: the base tools, then the configured memory tools. */
export function scannerTools(memoryTools: readonly string[] = []): string[] {
  return [...BASE_SCANNER_TOOLS, ...memoryTools]
}

/** What the guard lets a scanner call. ToolSearch only loads tool schemas: deferred tools may sit behind it. */
export function scannerToolSet(memoryTools: readonly string[] = []): ReadonlySet<string> {
  return new Set([...scannerTools(memoryTools), 'ToolSearch'])
}

const BASE_SET = scannerToolSet()

const FORBIDDEN = /['"(){};|@$,]|[^\x20-\x7e]/
// A resource group name as the allowlist takes it: no leading '-', no parentheses.
const GROUP = '[A-Za-z0-9_.][A-Za-z0-9_.-]{0,89}'
const LINE = new RegExp(
  `^az (resource list|group list|account show)( (-g|--resource-group) ${GROUP}| (-o|--output) json| --subscription [0-9a-fA-F-]{36})*$`,
)
const GROUP_ONLY = new RegExp(`^${GROUP}$`)

/** True for a resource group name the scanner's `-g` would accept. */
export const isAllowedGroupName = (name: string): boolean => GROUP_ONLY.test(name)
const OPTIONS: readonly RegExp[] = [/ (-g|--resource-group) /g, / (-o|--output) /g, / --subscription /g]

const atMostOnce = (line: string) => OPTIONS.every((re) => (line.match(re) ?? []).length <= 1)

/** True only for one `az resource list|group list|account show` call in the allowed form. Never throws. */
export function isAllowedAgentCommand(commandLine: string): boolean {
  if (typeof commandLine !== 'string') return false
  const line = commandLine.trim()
  if (hasShellMeta(line) || FORBIDDEN.test(line)) return false
  return LINE.test(line) && atMostOnce(line)
}

/** True for a tool the scanner may call at all (Bash is judged further by its command). */
export function isScannerTool(tool: string, allowed: ReadonlySet<string> = BASE_SET): boolean {
  return allowed.has(tool)
}
