import { expect, test } from 'claude-code/testing'
import type { IndexRow } from '../types'
import { groupByType, pickTab } from './tabs'

const row = (name: string, type: string): IndexRow => ({
  id: `/subscriptions/s/resourceGroups/rg/providers/${type}/${name}`,
  name,
  type,
  resourceGroup: 'rg',
  subscription: 's',
  source: 'hook',
  firstSeen: '',
  lastSeen: '',
})

test('groups rows by type, case-insensitive', () => {
  const tabs = groupByType([row('a', 'Microsoft.Web/sites'), row('b', 'microsoft.web/SITES'), row('c', 'Microsoft.App/containerApps')])
  expect(tabs.map((t) => [t.key, t.label, t.count])).toEqual([
    ['microsoft.web/sites', 'App Service', 2],
    ['microsoft.app/containerapps', 'Container Apps', 1],
  ])
  expect(tabs[0]?.rows.map((r) => r.name)).toEqual(['a', 'b'])
})

test('sorts by count then label', () => {
  const tabs = groupByType([row('1', 'Microsoft.Foo/zeta'), row('2', 'Microsoft.Foo/alpha'), row('3', 'Microsoft.Foo/mid'), row('4', 'Microsoft.Foo/mid')])
  expect(tabs.map((t) => t.label)).toEqual(['Foo mid', 'Foo alpha', 'Foo zeta'])
})

test('pickTab falls back to first when the selected tab is gone', () => {
  const tabs = groupByType([row('a', 'Microsoft.Web/sites'), row('b', 'Microsoft.Foo/bar')])
  expect(pickTab(tabs, 'microsoft.foo/bar')?.label).toBe('Foo bar')
  expect(pickTab(tabs, 'gone')).toBe(tabs[0])
  expect(pickTab(tabs, undefined)).toBe(tabs[0])
})

test('pickTab on empty list is undefined', () => {
  expect(pickTab([], 'x')).toBeUndefined()
})
