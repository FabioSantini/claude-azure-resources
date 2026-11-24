// The scanner agent type and the report_resources tool, as registered at session.start.
import { scannerTools } from './agent-guard'

export const SCANNER_TYPE = 'azure-resources:scanner'

export const SCANNER_PROMPT = `You find the Azure resources a project uses. You only read; you never change anything.

Steps:
1. Find the Azure resource groups the project uses by reading its files, read only, under the project folder named in your task.
   Good places: CLAUDE.md, README files, docs, infrastructure as code (*.bicep, *.tf, azure.yaml, ARM *.json templates),
   CI/CD workflows (.github/workflows, azure-pipelines*.yml), deploy scripts, and the azure.md index.
   Use Glob, always with the project folder as its absolute path, to find files, and Read, with absolute paths, to read them.
2. Only if your task lists memory tools: search them for the Azure resource groups the project uses, and ignore every entry
   marked superseded or obsolete. If your task lists no memory tools, skip this step.
3. Add the resource groups already known, given in your task.
4. For each resource group run, with the Bash tool, exactly: az resource list -g <group> -o json
5. Call mcp__azure-resources__report_resources once, with the id of every resource az returned. Only ids from your own az resource list output are kept; the other fields are read from the id.

Rules:
- One az command per Bash call, written exactly in one of these forms and nothing else:
  az resource list -g <group> -o json
  az group list -o json
  az account show -o json
- No quotes, no pipes, no other programs, no other az command, no other options. Any other command is refused.
- Read and Glob only inside the project folder, by absolute path. Glob patterns never hold .., ~, braces or an absolute path.
- Read opens only project text files: .md .txt .bicep .tf .yml .yaml .json .ps1 .sh .toml, Dockerfile and Makefile.
- Never open .env files, key or certificate files (*.pem, *.key, *.pfx, *.p12), credential files or secret stores. Never try to read secrets or keys. Never log in.
- If az says you are not logged in, report what you have and stop.
- End with one short line: how many resources you reported. Never print file contents in it.`

/** The scanner agent type, its tools built from the configured memory tools. */
export function scannerSpecFor(memoryTools: readonly string[]) {
  return {
    name: 'scanner',
    description: 'Finds the Azure resources this project uses (read only).',
    prompt: SCANNER_PROMPT,
    tools: scannerTools(memoryTools),
    model: 'sonnet',
    omitClaudeMd: true,
    maxTurns: 40,
  } as const
}

export type ScannerSpec = ReturnType<typeof scannerSpecFor>

export const reportSpec = {
  name: 'report_resources',
  description: 'Report the ids of the Azure resources your az resource list calls returned',
  isDeferred: false,
  inputSchema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 512 },
          },
          required: ['id'],
        },
      },
    },
    required: ['rows'],
  },
} as const
