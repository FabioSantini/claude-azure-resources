import { expect, test } from 'claude-code/testing'
import { HIDDEN_KEYS, keyFields, statusOf, typeLabel } from './type-catalog'

const APP = {
  location: 'Italy North',
  properties: {
    latestRevisionName: 'my-app--0000003',
    environmentId: '/subscriptions/s/resourceGroups/rg/providers/Microsoft.App/managedEnvironments/my-env',
    runningStatus: 'Running',
    provisioningState: 'Succeeded',
    configuration: { ingress: { fqdn: 'my-app.example.azurecontainerapps.io' } },
    template: {
      scale: { minReplicas: 1, maxReplicas: 1 },
      containers: [{ image: 'acr.azurecr.io/my-app:1', resources: { cpu: 4, memory: '8Gi' } }],
    },
  },
}
const ROW = { resourceGroup: 'rg-demo' }
const val = (fs: { label: string; value: string }[], label: string) => fs.find((f) => f.label === label)?.value

test('labels known types and falls back to provider and last segment', () => {
  expect(typeLabel('Microsoft.App/containerApps')).toBe('Container Apps')
  expect(typeLabel('Microsoft.Web/sites')).toBe('App Service')
  expect(typeLabel('Microsoft.Foo/bars')).toBe('Foo bars')
  expect(typeLabel('Microsoft.Foo/bars/bazs')).toBe('Foo bazs')
  expect(typeLabel('Contoso.Things/widgets')).toBe('Contoso.Things widgets')
  expect(typeLabel('weird')).toBe('weird')
})

test('type match is case-insensitive', () => {
  expect(typeLabel('MICROSOFT.APP/CONTAINERAPPS')).toBe('Container Apps')
  expect(val(keyFields('microsoft.app/containerapps', APP, ROW), 'Revision')).toBe('--0000003')
})

test('container app key fields from a realistic snapshot', () => {
  const fs = keyFields('Microsoft.App/containerApps', APP, ROW)
  expect(val(fs, 'URL')).toBe('https://my-app.example.azurecontainerapps.io')
  expect(fs.find((f) => f.label === 'URL')?.isLink).toBe(true)
  expect(val(fs, 'Revision')).toBe('--0000003')
  expect(val(fs, 'Replicas')).toBe('1 – 1')
  expect(val(fs, 'CPU / memory')).toBe('4 vCPU · 8Gi')
  expect(val(fs, 'Image')).toBe('acr.azurecr.io/my-app:1')
  expect(val(fs, 'Environment')).toBe('my-env')
  expect(val(fs, 'Region')).toBe('Italy North')
  expect(val(fs, 'Resource group')).toBe('rg-demo')
})

test('missing and odd values render as —', () => {
  const fs = keyFields('Microsoft.Storage/storageAccounts', { kind: null, sku: [], properties: { accessTier: {} } }, ROW)
  expect(val(fs, 'Kind')).toBe('—')
  expect(val(fs, 'SKU')).toBe('—')
  expect(val(fs, 'Access tier')).toBe('—')
  expect(val(fs, 'Blob')).toBe('—')
  expect(val(keyFields('x/y', { kind: 0 }, ROW), 'Kind')).toBe('0')
  expect(val(keyFields('x/y', { kind: true }, ROW), 'Kind')).toBe('true')
  expect(keyFields('x/y', undefined, ROW).length).toBeGreaterThan(0)
  expect(keyFields('x/y', 'str', ROW).length).toBeGreaterThan(0)
})

test('app service runtime falls back to kind', () => {
  const a = keyFields('microsoft.web/sites', { kind: 'app,linux', properties: { siteConfig: { linuxFxVersion: 'NODE|20' }, serverFarmId: '/x/serverfarms/plan1' } }, ROW)
  expect(val(a, 'Runtime')).toBe('NODE|20')
  expect(val(a, 'Plan')).toBe('plan1')
  expect(val(keyFields('microsoft.web/sites', { kind: 'app' }, ROW), 'Runtime')).toBe('app')
})

test('statusOf tones', () => {
  expect(statusOf(APP)).toEqual({ text: 'Running', tone: 'ok' })
  expect(statusOf({ properties: { provisioningState: 'Updating' } }).tone).toBe('busy')
  expect(statusOf({ properties: { state: 'Stopped' } }).tone).toBe('bad')
  expect(statusOf({ properties: { state: 'Foo' } })).toEqual({ text: 'Foo', tone: 'unknown' })
  expect(statusOf({})).toEqual({ text: 'Unknown', tone: 'unknown' })
  expect(statusOf(null)).toEqual({ text: 'Unknown', tone: 'unknown' })
})

test('hidden keys', () => {
  expect([...HIDDEN_KEYS]).toEqual(['systemData', 'id'])
})

test('prototype keys and missing inputs never throw', () => {
  expect(typeLabel('constructor')).toBe('constructor')
  expect(typeLabel('__proto__')).toBe('__proto__')
  expect(keyFields('constructor', {}, ROW).length).toBeGreaterThan(0)
  expect(keyFields('__proto__', {}, ROW).length).toBeGreaterThan(0)
  expect(keyFields(undefined as unknown as string, {}, ROW).length).toBeGreaterThan(0)
  expect(val(keyFields('x/y', {}, undefined as unknown as { resourceGroup: string }), 'Resource group')).toBe('—')
})

test('whitespace-only value shows a dash', () => {
  expect(val(keyFields('x/y', { kind: '   ' }, ROW), 'Kind')).toBe('—')
})
