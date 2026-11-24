import { expect, test } from 'claude-code/testing'
import { ID, ID2, PANE, flows, idOf, pickTab, selectedTab, stage, updated, type Answer } from './pane-test-kit'

const ID3 = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/api2'
const APP = 'microsoft.app/containerapps'

const appData = (id: string, fqdn = 'web.example.io') => ({
  id,
  location: 'italynorth',
  systemData: { createdBy: 'someone' },
  properties: {
    runningStatus: 'Running',
    provisioningState: 'Succeeded',
    outboundIpAddresses: '10.0.0.1',
    latestRevisionName: 'web--0000003',
    configuration: { ingress: { fqdn } },
    template: { scale: { minReplicas: 1, maxReplicas: 3 }, containers: [{ image: 'acr.io/web:v1', resources: { cpu: 4, memory: '8Gi' } }] },
  },
})
const siteData = (id: string) => ({ id, location: 'italynorth', properties: { state: 'Stopped', defaultHostName: 'site.azurewebsites.net' } })

const ok = (data: unknown): Answer => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(data) })
const answer = (argv: readonly string[]): Answer => {
  const id = idOf(argv)
  return ok(id.includes('containerApps') ? appData(id) : siteData(id))
}

const cardKeys = async (ui: any): Promise<string[]> =>
  (await ui.findAll({ type: 'Box' })).map((n: { key?: string }) => n.key ?? '').filter((k: string) => k.startsWith('card:'))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`header shows title and by Fabio Santini (${surface})`, async ($) => {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Azure resources$/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^by Fabio Santini$/ }))?.props.dimColor).toBe(true)
    expect((await ui.find({ key: 'update' }))?.text).toBe('Update')
    expect((await ui.find({ key: 'scan' }))?.text).toBe('Scan')
    await ui.unmount()
  })

  test(`one tab per type with counts and only that type's cards (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2, ID3], answer)
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    const tabs = await ui.findAll({ type: 'Text', text: /^(App Service 2|Container Apps 1)$/, in: 'tabs' })
    expect(tabs.map((t: { text: string }) => t.text)).toEqual(['App Service 2', 'Container Apps 1'])
    expect(await selectedTab(ui)).toBe('microsoft.web/sites')
    expect(await cardKeys(ui)).toEqual([`card:${ID2}`, `card:${ID3}`])
    expect(await ui.find({ type: 'Text', text: /^web$/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`pressing a tab switches the cards (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2, ID3], answer)
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await pickTab(ui, APP)
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await cardKeys(again)).toEqual([`card:${ID}`])
    expect(await selectedTab(again)).toBe(APP)
    expect(await again.find({ type: 'Text', text: /^api$/ })).toBeUndefined()
    await again.unmount()
  })

  test(`card shows key fields and status badge (${surface})`, async ($, on) => {
    const s = stage(on, [ID], answer)
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^web$/ }))?.props.bold).toBe(true)
    const badge = await ui.find({ type: 'Text', text: /● Running/ })
    expect(badge?.props.color).toBe('success')
    expect(await ui.find({ type: 'Text', text: /^Container Apps$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^URL$/ })).toBeDefined()
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://web.example.io')
    expect(await ui.find({ type: 'Text', text: /^--0000003$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1 – 3$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Resource group$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Updated \d\d\/\d\d \d\d:\d\d$/ })).toBeDefined()
    expect(await ui.find({ key: `refresh:${ID}` })).toBeDefined()
    expect((await ui.find({ key: `props:${ID}` }))?.text).toBe('All properties')
    await ui.unmount()
  })

  test(`error snapshot shows name, Error badge and error text (${surface})`, async ($, on) => {
    const s = stage(on, [ID], () => ({ exitCode: 1, stdout: '', stderr: 'ERROR: boom' }))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^web$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /● Error/ }))?.props.color).toBe('error')
    expect(await ui.find({ type: 'Text', text: /Failed: ERROR: boom/ })).toBeDefined()
    await ui.unmount()
  })

  test(`All properties toggles, never shows systemData or id, shows outbound IPs (${surface})`, async ($, on) => {
    const s = stage(on, [ID], answer)
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /provisioningState/ })).toBeUndefined()
    await ui.press({ key: `props:${ID}` })
    await ui.unmount()
    const open = await $.ui.mount({ ...PANE, surface })
    expect(await open.find({ type: 'Text', text: /provisioningState: Succeeded/ })).toBeDefined()
    expect((await open.find({ key: `props:${ID}` }))?.text).toBe('Hide properties')
    const texts = (await open.findAll({ type: 'Text' })).map((n: { text: string }) => n.text)
    expect(texts.some((t: string) => /systemData|^\s*id:/.test(t))).toBe(false)
    expect(texts).toContain('  outboundIpAddresses: 10.0.0.1')
    await open.press({ key: `props:${ID}` })
    await open.unmount()
    const closed = await $.ui.mount({ ...PANE, surface })
    expect(await closed.find({ type: 'Text', text: /provisioningState/ })).toBeUndefined()
    expect((await closed.find({ key: `props:${ID}` }))?.text).toBe('All properties')
    await closed.unmount()
  })

  test(`long URL is truncated and the card still renders (${surface})`, async ($, on) => {
    const s = stage(on, [ID], (argv) => ok(appData(idOf(argv), `${Array(40).fill('segment').join('.')}.io`)))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^web$/ })).toBeDefined()
    const link = (await ui.findAll({ type: 'Link' }))[0]
    const url = link ?? (await ui.find({ type: 'Text', text: /segment/ }))
    expect(url).toBeDefined()
    expect(url!.text.length).toBeLessThanOrEqual(link ? 60 : 200)
    expect(url!.text.endsWith('…')).toBe(true)
    expect(await ui.find({ type: 'Text', text: /● Running/ })).toBeDefined()
    await ui.unmount()
  })

  test(`selected tab removed → first tab shown (${surface})`, async ($, on) => {
    const ids = [ID, ID2, ID3]
    const s = stage(on, ids, answer)
    await flows($, s)
    const first = await $.ui.mount({ ...PANE, surface })
    await pickTab(first, APP)
    await first.unmount()
    ids.splice(0, 1) // the container app leaves azure.md
    await updated($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^Container Apps/, in: 'tabs' })).toBeUndefined()
    expect(await cardKeys(ui)).toEqual([`card:${ID2}`, `card:${ID3}`])
    expect(await selectedTab(ui)).toBe('microsoft.web/sites')
    await ui.unmount()
  })

  test(`a site without defaultHostName shows — as its URL (${surface})`, async ($, on) => {
    const s = stage(on, [ID2], (argv) => ok({ id: idOf(argv), location: 'italynorth', properties: { state: 'Running' } }))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^—$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`opening a card closes cards no longer in view (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2, ID3], answer)
    await flows($, s)
    const a = await $.ui.mount({ ...PANE, surface })
    await pickTab(a, APP)
    await a.press({ key: `props:${ID}` })
    await pickTab(a, 'microsoft.web/sites')
    await a.unmount()
    const b = await $.ui.mount({ ...PANE, surface })
    await b.press({ key: `props:${ID2}` })
    await pickTab(b, APP)
    await b.unmount()
    const c = await $.ui.mount({ ...PANE, surface })
    expect((await c.find({ key: `props:${ID}` }))?.text).toBe('All properties')
    await c.unmount()
  })

  test(`a failing Scan press does not reject (${surface})`, async ($, on) => {
    on('ui.open', () => {
      throw new Error('no surface')
    })
    const ui = await $.ui.mount({ ...PANE, surface })
    // An unhandled rejection fails this file ("the file ran to its end").
    await ui.press({ key: 'scan' })
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await ui.unmount()
  })
}
