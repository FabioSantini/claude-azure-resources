import { expect, test } from 'claude-code/testing'
import { isAllowedModArgs, runAz } from './az-run'
import { isArmId } from './arm-id'

type Call = { argv: readonly string[]; init: unknown }
const fake = (
  result: { exitCode: number; stdout: string; stderr: string } | Error,
  calls: Call[] = [],
) => ({
  process: {
    run: async (argv: readonly string[], init?: unknown) => {
      calls.push({ argv, init })
      if (result instanceof Error) throw result
      return result
    },
  },
})
const ID = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app'

test('rejects storage account keys list', async () => {
  expect(isAllowedModArgs(['storage', 'account', 'keys', 'list'])).toBe(false)
  let threw = false
  try {
    await runAz(fake({ exitCode: 0, stdout: '{}', stderr: '' }), 'py', ['storage', 'account', 'keys', 'list'])
  } catch {
    threw = true
  }
  expect(threw).toBe(true)
})

test('rejects resource delete and other shapes', async () => {
  expect(isAllowedModArgs(['resource', 'delete', '--ids', ID])).toBe(false)
  expect(isAllowedModArgs(['resource', 'show', '--ids', ID, '-o', 'tsv'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'show', '--ids'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'show', '--ids', '--name'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a', '--name', 'b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--query', 'x'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a&b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a"b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', '%x%'])).toBe(false)
  expect(isAllowedModArgs(['account', 'show', 'x'])).toBe(false)
  expect(isAllowedModArgs(['account', 'get-access-token'])).toBe(false)
})

test('allows the three read-only shapes', () => {
  expect(isAllowedModArgs(['resource', 'show', '--ids', ID])).toBe(true)
  expect(isAllowedModArgs(['resource', 'list'])).toBe(true)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'app', '--resource-group', 'rg'])).toBe(true)
  expect(isAllowedModArgs(['account', 'show'])).toBe(true)
})

test('parses JSON stdout and builds argv', async () => {
  const calls: Call[] = []
  const r = await runAz(fake({ exitCode: 0, stdout: '{"id":"x"}', stderr: '' }, calls), 'py.exe', ['resource', 'show', '--ids', ID])
  expect(r).toEqual({ ok: true, data: { id: 'x' } })
  expect(calls[0]!.argv).toEqual(['py.exe', '-IBm', 'azure.cli', 'resource', 'show', '--ids', ID, '-o', 'json'])
  expect(calls[0]!.init).toEqual({ timeoutMs: 30000 })
})

test('maps login error', async () => {
  const r = await runAz(fake({ exitCode: 1, stdout: '', stderr: '\nERROR: Please run "az login" to setup account.\n' }), 'py', ['account', 'show'])
  expect(r.ok).toBe(false)
  if (!r.ok) {
    expect(r.error).toBe('not-logged-in')
    expect(r.message).toContain('az login')
  }
})

test('maps not found', async () => {
  const r = await runAz(fake({ exitCode: 3, stdout: '', stderr: '(ResourceNotFound) The Resource could not be found' }), 'py', ['resource', 'show', '--ids', ID])
  expect(r).toMatchObject({ ok: false, error: 'not-found' })
})

test('maps timeout rejection and parse failure', async () => {
  const t = await runAz(fake(new Error('process timed out after 30000ms')), 'py', ['account', 'show'])
  expect(t).toMatchObject({ ok: false, error: 'timeout' })
  const p = await runAz(fake({ exitCode: 0, stdout: 'not json', stderr: '' }), 'py', ['account', 'show'])
  expect(p).toMatchObject({ ok: false, error: 'failed' })
  const f = await runAz(fake({ exitCode: 2, stdout: '', stderr: 'boom' }), 'py', ['account', 'show'])
  expect(f).toMatchObject({ ok: false, error: 'failed', message: 'boom' })
})

test('rejects --ids that is not an ARM id', () => {
  for (const bad of ['foo', '/subscriptions/s?x=1', '/subscriptions', '/subscriptions/s1/../x', '/subscriptions/s1/a b'])
    expect(isAllowedModArgs(['resource', 'show', '--ids', bad])).toBe(false)
})

test('accepts a real ARM id', () => {
  expect(isAllowedModArgs(['resource', 'show', '--ids', ID])).toBe(true)
  expect(isArmId(ID)).toBe(true)
  expect(isArmId('/SUBSCRIPTIONS/s1/resourceGroups/rg(1)')).toBe(true)
})

test('rejects --name or --resource-group with a space or slash', () => {
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'a/b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--resource-group', 'a/b'])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'x'.repeat(91)])).toBe(false)
  expect(isAllowedModArgs(['resource', 'list', '--name', 'my-app_1.x(2)'])).toBe(true)
})

test('masks secrets in the error message', async () => {
  const r = await runAz(fake({ exitCode: 1, stdout: '', stderr: 'ERROR: bad AccountKey=abc123def456 here' }), 'py', ['account', 'show'])
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.message).not.toContain('abc123def456')
})

test('caps the message at 200 chars', async () => {
  const r = await runAz(fake({ exitCode: 1, stdout: '', stderr: 'x'.repeat(500) }), 'py', ['account', 'show'])
  if (!r.ok) expect(r.message.length).toBeLessThanOrEqual(200)
})
