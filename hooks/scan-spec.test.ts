import { expect, test } from 'claude-code/testing'
import { scannerPrompt } from './scan'
import { SCANNER_PROMPT, scannerSpecFor } from './scan-spec'

const REPORT = 'mcp__azure-resources__report_resources'

test('scanner tools without memory: Bash, Read, Glob and report', () => {
  expect([...scannerSpecFor([]).tools]).toEqual(['Bash', 'Read', 'Glob', REPORT])
})

test('scanner tools with memory: the configured names are added', () => {
  expect([...scannerSpecFor(['mcp__m__search', 'mcp__m__list']).tools]).toEqual(['Bash', 'Read', 'Glob', REPORT, 'mcp__m__search', 'mcp__m__list'])
})

const mcpNames = (text: string) => [...new Set(text.match(/mcp__[A-Za-z0-9_-]+/g) ?? [])]

test('without memory tools, the prompt and the task name no MCP tool but the report tool', () => {
  expect(mcpNames(SCANNER_PROMPT).every((n) => n === REPORT)).toBe(true)
  expect(mcpNames(scannerPrompt('C:/p', ['rg']))).toEqual([])
  expect(SCANNER_PROMPT).not.toContain('Grep')
  expect(scannerSpecFor([]).prompt).toBe(SCANNER_PROMPT)
})

test('the scanner prompt names where to look and what never to open', () => {
  for (const s of ['CLAUDE.md', 'README', '*.bicep', '*.tf', 'azure.yaml', '.github/workflows', 'azure-pipelines', 'azure.md', '.env', 'az resource list -g <group> -o json', 'report_resources']) {
    expect(SCANNER_PROMPT).toContain(s)
  }
})
