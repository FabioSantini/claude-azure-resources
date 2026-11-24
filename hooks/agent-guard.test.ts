import { expect, test } from 'claude-code/testing'
import { isAllowedAgentCommand, isScannerTool, scannerToolSet } from './agent-guard'

const allowed = [
  'az resource list -g rg',
  'az resource list -g rg-demo -o json',
  'az resource list -g my_rg -o json',
  'az resource list --resource-group rg-demo --output json',
  'az group list -o json',
  'az account show',
  'az account show -o json',
  'az resource list -g rg -o json --subscription 0123abcd-0123-abcd-0123-0123456789ab',
  '  az group list -o json  ',
]

const denied = [
  'az keyvault secret show -n a',
  'az storage account keys list -n a',
  'az resource show --ids /subscriptions/x',
  'rm -rf x',
  'az group list & rm x',
  'az group list @(calc)',
  'az group list (calc)',
  'az resource list --name "$(rm x)"',
  'az group list \\"; rm x; \\"',
  'head -n 1 f',
  'az resource list -g rg -g rg2',
  'az resource list -o json -o json',
  'AZ resource list',
  'az resource list -g rg | jq .',
  'az resource list -g rg; az group list',
  'az resource list -g rg && az group list',
  'az resource list -g `calc`',
  'az resource list -g rg\naz group list',
  'az resource list -g rg -o table',
  'az resource list --name x',
  'az resource list -g rg --query "[].id"',
  'az resource list -g r,g',
  'az resource list  -g rg',
  'az resource list -g rg --subscription x',
  'az resource list -g rgè',
  'az group delete -g rg',
  'az resource list -g --query -o json',
  'az login',
  'az',
  '',
]

for (const line of allowed) {
  test(`guard allows ${JSON.stringify(line)}`, () => {
    expect(isAllowedAgentCommand(line)).toBe(true)
  })
}

for (const line of denied) {
  test(`guard denies ${JSON.stringify(line)}`, () => {
    expect(isAllowedAgentCommand(line)).toBe(false)
  })
}

test('guard never throws on odd input', () => {
  expect(isAllowedAgentCommand(undefined as unknown as string)).toBe(false)
  expect(isAllowedAgentCommand(42 as unknown as string)).toBe(false)
})

test('scanner tools are the read-only list only', () => {
  for (const t of ['Bash', 'Read', 'Glob', 'mcp__azure-resources__report_resources', 'ToolSearch']) {
    expect(isScannerTool(t)).toBe(true)
  }
  for (const t of ['PowerShell', 'Write', 'Edit', 'Agent', 'Grep', 'mcp__my-memory__memory_search', 'WebFetch', 'NotebookEdit']) {
    expect(isScannerTool(t)).toBe(false)
  }
})

test('configured memory tools join the scanner tools, others stay out', () => {
  const set = scannerToolSet(['mcp__my-memory__memory_search'])
  expect(isScannerTool('mcp__my-memory__memory_search', set)).toBe(true)
  expect(isScannerTool('Read', set)).toBe(true)
  expect(isScannerTool('mcp__my-memory__memory_store', set)).toBe(false)
})
