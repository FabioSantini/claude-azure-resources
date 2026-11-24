// How the pane looks: a card waiting for its first snapshot, gaps between buttons, colored tabs.
import { expect, test } from 'claude-code/testing'
import { ID, ID2, PANE, flows, idOf, okShow, stage, start } from './pane-test-kit'
import { CATALOG, FALLBACK_COLOR } from './type-catalog-data'
import { SUB, offer, scan, seeAndReport, stage as scanStage } from './scan-test-kit'

const SITES = 'microsoft.web/sites'
const APPS = 'microsoft.app/containerapps'
const ODD = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Foo/bars/odd'
const color = (key: string) => CATALOG[key]!.color

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a card nothing is refreshing says so, with dashes (${surface})`, async ($, on) => {
    stage(on, [ID2], (argv) => okShow(idOf(argv)))
    await start($)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Not refreshed yet — press Refresh$/ }))?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^Loading…$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^URL$/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: /^—$/ })).length).toBeGreaterThan(0)
    expect(await ui.find({ type: 'Text', text: /^rg$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Updated / })).toBeUndefined()
    await ui.unmount()
  })

  test(`a card whose refresh is queued says Loading… (${surface})`, async ($, on) => {
    scanStage(on, { hangRuns: true })
    await start($)
    await scan($)
    await offer($, 'scan-1')
    await seeAndReport($, [{ id: ID2.replace('/s1/', `/${SUB}/`) }])
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Loading…$/ }))?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^Not refreshed yet/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`a refreshed card no longer says Loading… (${surface})`, async ($, on) => {
    const s = stage(on, [ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^Loading…$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Not refreshed yet/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`buttons in a row have a gap (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'actions' }))?.props.gap).toBe(1)
    expect((await ui.find({ key: `actions:${ID2}` }))?.props.gap).toBe(1)
    await ui.unmount()
  })

  test(`each tab name is in its type's color (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^App Service 1$/, in: 'tabs' }))?.props.color).toBe(color(SITES))
    expect((await ui.find({ type: 'Text', text: /^Container Apps 1$/, in: 'tabs' }))?.props.color).toBe(color(APPS))
    expect((await ui.find({ type: 'Text', text: /^App Service$/ }))?.props.color).toBe(color(SITES))
    await ui.unmount()
  })

  test(`an unknown type's tab and type line are gray (${surface})`, async ($, on) => {
    stage(on, [ODD], (argv) => okShow(idOf(argv)))
    await start($)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Foo bars 1$/, in: 'tabs' }))?.props.color).toBe(FALLBACK_COLOR)
    expect((await ui.find({ type: 'Text', text: /^Foo bars$/ }))?.props.color).toBe(FALLBACK_COLOR)
    await ui.unmount()
  })
}
