// The types added after the first catalog, the fallback label and the per-type colors.
import { expect, test } from 'claude-code/testing'
import { CATALOG, FALLBACK_COLOR } from './type-catalog-data'
import { keyFields, textOn, typeColor, typeLabel } from './type-catalog'

const ROW = { resourceGroup: 'rg-demo' }
const val = (fs: { label: string; value: string }[], label: string) => fs.find((f) => f.label === label)?.value

test('labels of common resource types', () => {
  expect(typeLabel('Microsoft.CognitiveServices/accounts/projects')).toBe('Foundry project')
  expect(typeLabel('Microsoft.Search/searchServices')).toBe('AI Search')
  expect(typeLabel('Microsoft.OperationalInsights/workspaces')).toBe('Log Analytics')
  expect(typeLabel('Microsoft.KeyVault/vaults')).toBe('Key Vault')
  expect(typeLabel('Microsoft.ManagedIdentity/userAssignedIdentities')).toBe('Managed identity')
  expect(typeLabel('Microsoft.Bing/accounts')).toBe('Bing')
})

test('AI Search key fields', () => {
  const fs = keyFields('microsoft.search/searchservices', { sku: { name: 'basic' }, properties: { replicaCount: 1, partitionCount: 2, status: 'running' } }, ROW)
  expect([val(fs, 'SKU'), val(fs, 'Replicas'), val(fs, 'Partitions'), val(fs, 'Status')]).toEqual(['basic', '1', '2', 'running'])
})

test('Log Analytics key fields', () => {
  const fs = keyFields('microsoft.operationalinsights/workspaces', { properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 } }, ROW)
  expect([val(fs, 'SKU'), val(fs, 'Retention (days)')]).toEqual(['PerGB2018', '30'])
})

test('Key Vault key fields: the vault URI is a link', () => {
  const fs = keyFields('microsoft.keyvault/vaults', { properties: { vaultUri: 'https://kv-demo.vault.azure.net/', sku: { name: 'standard' } } }, ROW)
  expect(val(fs, 'Vault URI')).toBe('https://kv-demo.vault.azure.net/')
  expect(fs.find((f) => f.label === 'Vault URI')?.isLink).toBe(true)
  expect(val(fs, 'SKU')).toBe('standard')
})

test('Managed identity and Bing key fields', () => {
  const mi = keyFields('microsoft.managedidentity/userassignedidentities', { properties: { principalId: 'p-1', clientId: 'c-1' } }, ROW)
  expect([val(mi, 'Principal id'), val(mi, 'Client id')]).toEqual(['p-1', 'c-1'])
  const bing = keyFields('microsoft.bing/accounts', { kind: 'Bing.Grounding', sku: { name: 'G1' } }, ROW)
  expect([val(bing, 'Kind'), val(bing, 'SKU')]).toEqual(['Bing.Grounding', 'G1'])
})

test('a Foundry project has its label and region', () => {
  const fs = keyFields('microsoft.cognitiveservices/accounts/projects', { location: 'italynorth' }, ROW)
  expect(val(fs, 'Region')).toBe('italynorth')
  expect(val(fs, 'Resource group')).toBe('rg-demo')
})

test('every catalog type has its own color; unknown types are gray', () => {
  const colors = Object.values(CATALOG).map((s) => s.color)
  expect(colors.every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true)
  expect(new Set(colors).size).toBe(colors.length)
  expect(typeColor('Microsoft.App/containerApps')).toBe(CATALOG['microsoft.app/containerapps']!.color)
  expect(typeColor('Microsoft.Foo/bars')).toBe(FALLBACK_COLOR)
  expect(typeColor('constructor')).toBe(FALLBACK_COLOR)
})

test('text on a color: whichever of dark and white contrasts more', () => {
  expect(textOn('#ED93B1')).toBe('#1A1A1A')
  expect(textOn('#378ADD')).toBe('#1A1A1A')
  expect(textOn('#1F3A5F')).toBe('#FFFFFF')
  expect(textOn('not a color')).toBe('#FFFFFF')
})
