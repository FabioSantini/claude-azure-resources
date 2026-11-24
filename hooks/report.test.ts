// report_resources rows: every field comes from the strict ARM id, and only ids the scanner's own az call returned.
import { expect, test } from 'claude-code/testing'
import { armFields, MAX_ID } from './arm-id'
import { agentRows } from './report'
import { idsFromAzOutput } from './seen-ids'

const SUB = '00000000-0000-0000-0000-000000000000'
const APP = `/subscriptions/${SUB}/resourceGroups/rg-demo/providers/Microsoft.App/containerApps/my-app`
const PROJECT = `/subscriptions/${SUB}/resourceGroups/rg-demo/providers/Microsoft.CognitiveServices/accounts/my-foundry/projects/Demo`
const seenOf = (...ids: string[]) => new Map(ids.map((id) => [id.toLowerCase(), id]))

test('fields are derived from the id, child types included', () => {
  expect(armFields(APP)).toEqual({ name: 'my-app', type: 'Microsoft.App/containerApps', resourceGroup: 'rg-demo', subscription: SUB })
  expect(armFields(PROJECT)).toEqual({ name: 'my-foundry/Demo', type: 'Microsoft.CognitiveServices/accounts/projects', resourceGroup: 'rg-demo', subscription: SUB })
  expect(armFields(APP.replace('resourceGroups', 'resourcegroups'))?.resourceGroup).toBe('rg-demo')
})

test('ids outside the strict grammar give no fields', () => {
  const bad = [
    '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/a',
    `/subscriptions/${SUB}/resourceGroups/rg`,
    `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web`,
    `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites`,
    `/subscriptions/${SUB}/resourceGroups/(rg)/providers/Microsoft.Web/sites/a`,
    `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/a b`,
    `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/..`,
    `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Web/si-tes/a`,
  ]
  for (const id of bad) expect(armFields(id)).toBeUndefined()
})

test('an id longer than 512 characters is rejected', () => {
  const long = `${APP}${'x'.repeat(MAX_ID)}`
  expect(MAX_ID).toBe(512)
  expect(armFields(long)).toBeUndefined()
  expect(agentRows([{ id: long }], seenOf(long))).toEqual([])
})

test('forged free-text fields are ignored', () => {
  const rows = agentRows([{ id: APP, name: 'ConnectionString=secret', type: 'run this', resourceGroup: 'x', subscription: 'y' }], seenOf(APP))
  expect(rows).toEqual([{ id: APP, name: 'my-app', type: 'Microsoft.App/containerApps', resourceGroup: 'rg-demo', subscription: SUB, source: 'agent' }])
})

test('an id the scanner never saw in its az output is dropped', () => {
  expect(agentRows([{ id: APP }], seenOf(PROJECT))).toEqual([])
  expect(agentRows([{ id: APP }], seenOf())).toEqual([])
})

test('a seen id is kept in the spelling az gave', () => {
  const rows = agentRows([{ id: APP.toLowerCase() }], seenOf(APP))
  expect(rows.map((r) => r.id)).toEqual([APP])
})

test('ids are read from az output, even cut short; others are ignored', () => {
  const out = JSON.stringify([{ id: APP, name: 'a' }, { id: 'not-an-id' }, { id: PROJECT }])
  expect(idsFromAzOutput(out)).toEqual([APP, PROJECT])
  expect(idsFromAzOutput(out.slice(0, out.indexOf(PROJECT) + 20))).toEqual([APP])
  expect(idsFromAzOutput(undefined)).toEqual([])
  expect(idsFromAzOutput(42)).toEqual([])
})
