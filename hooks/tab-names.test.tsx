// Tab names: the data handed to the Client, the selection path back, the fallback where no Client is drawn.
import { expect, test } from 'claude-code/testing'
import { ID, ID2, PANE, flows, idOf, okShow, selectedTab, stage } from './pane-test-kit'
import { CATALOG } from './type-catalog-data'
import { tabNamesProps } from './tab-row'
import { groupByType } from './tabs'
import type { IndexRow } from '../types'

const SITES = 'microsoft.web/sites'
const APPS = 'microsoft.app/containerapps'
const color = (key: string) => CATALOG[key]!.color
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

const EXPECTED = {
  selected: SITES,
  tabs: [
    { key: SITES, label: 'App Service', count: 1, color: color(SITES) },
    { key: APPS, label: 'Container Apps', count: 1, color: color(APPS) },
  ],
}

const cardKeys = async (ui: any): Promise<string[]> =>
  (await ui.findAll({ type: 'Box' })).map((n: { key?: string }) => n.key ?? '').filter((k: string) => k.startsWith('card:'))

test('tabNamesProps hands only keys, labels, counts, colors and the selected key', () => {
  const tabs = groupByType([row('a', 'Microsoft.Web/sites'), row('b', 'Microsoft.App/containerApps')])
  const props = tabNamesProps(tabs, tabs[0])
  expect(props).toEqual(EXPECTED)
  for (const t of props.tabs) expect(Object.keys(t).sort()).toEqual(['color', 'count', 'key', 'label'])
  expect(Object.keys(props).sort()).toEqual(['selected', 'tabs'])
})

test('tabNamesProps passes labels through safeText', () => {
  const tabs = groupByType([row('a', 'Microsoft.Foo/ba‮r'), row('b', `Microsoft.Foo/${'x'.repeat(300)}`)])
  const labels = tabNamesProps(tabs, undefined).tabs.map((t) => t.label)
  expect(labels[0]).toBe('Foo ba r')
  expect(labels[1]!.length).toBe(200)
  expect(labels[1]!.endsWith('…')).toBe(true)
  expect(tabNamesProps(tabs, undefined).selected).toBe('')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the tab row is one Client fed only the tab data (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    const client = await ui.find({ type: 'Client' })
    expect(client?.key).toBe('tabs')
    expect(client?.props.props).toEqual(EXPECTED)
    expect(await ui.find({ key: `tabbox:${SITES}` })).toBeUndefined()
    expect(await ui.find({ key: `tab:${SITES}` })).toBeUndefined()
    await ui.unmount()
  })

  test(`the Client draws colored names, the selected one bold and underlined, with dim separators (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    const sel = await ui.find({ type: 'Text', text: /^App Service 1$/, in: 'tabs' })
    expect(sel?.props).toMatchObject({ color: color(SITES), bold: true, underline: true })
    expect(sel?.props.backgroundColor).toBeUndefined()
    const other = await ui.find({ type: 'Text', text: /^Container Apps 1$/, in: 'tabs' })
    expect(other?.props.color).toBe(color(APPS))
    expect(other?.props.bold).toBeFalsy()
    expect(other?.props.underline).toBeFalsy()
    expect(other?.props.backgroundColor).toBeUndefined()
    const seps = await ui.findAll({ type: 'Text', text: /^ \| $/, in: 'tabs' })
    expect(seps.map((t: { props: { dimColor?: boolean } }) => t.props.dimColor)).toEqual([true])
    const boxes = await ui.findAll({ type: 'Box', in: 'tabs' })
    for (const b of boxes) expect([b.props.borderStyle, b.props.backgroundColor]).toEqual([undefined, undefined])
    await ui.unmount()
  })

  test(`a click on a name selects its tab (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    // 'App Service 1' takes 13 cells, then ' | ': the second name starts at column 16.
    await ui.pointer({ type: 'down', x: 16, y: 0, button: 'left', in: 'tabs' })
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await cardKeys(again)).toEqual([`card:${ID}`])
    expect(await selectedTab(again)).toBe(APPS)
    await again.unmount()
  })

  test(`a click on the separator selects nothing (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.pointer({ type: 'down', x: 14, y: 0, button: 'left', in: 'tabs' })
    expect(await cardKeys(ui)).toEqual([`card:${ID2}`])
    await ui.unmount()
  })

  test(`arrow keys and Enter select a tab (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.key({ key: 'right', in: 'tabs' })
    await ui.key({ key: 'return', in: 'tabs' })
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await cardKeys(again)).toEqual([`card:${ID}`])
    await again.unmount()
  })

  test(`a post that is not a selection changes nothing (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.post({ select: 42 }, { in: 'tabs' })
    await ui.post({ other: APPS }, { in: 'tabs' })
    await ui.post({ select: 'x'.repeat(600) }, { in: 'tabs' })
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await cardKeys(again)).toEqual([`card:${ID2}`])
    await again.unmount()
  })
}

for (const surface of ['mobile', 'vscode'] as const) {
  test(`without a Client the tabs are native buttons with a colored dot (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await ui.find({ key: `tabbox:${SITES}` })).toBeUndefined()
    const sel = await ui.find({ key: `tab:${SITES}` })
    expect(sel?.type).toBe('Button')
    expect(sel?.props.variant).toBe('primary')
    expect(sel?.text).toContain('App Service 1')
    const other = await ui.find({ key: `tab:${APPS}` })
    expect(other?.props.variant).toBeUndefined()
    const dots = await ui.findAll({ type: 'Text', text: /^●$/ })
    expect(dots.map((d: { props: { color?: string } }) => d.props.color)).toEqual([color(SITES), color(APPS)])
    expect((await ui.find({ key: 'tabs' }))?.props.borderStyle).toBeUndefined()
    await ui.unmount()
  })

  test(`pressing a fallback tab selects it (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: `tab:${APPS}` })
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await cardKeys(again)).toEqual([`card:${ID}`])
    expect((await again.find({ key: `tab:${APPS}` }))?.props.variant).toBe('primary')
    await again.unmount()
  })
}
