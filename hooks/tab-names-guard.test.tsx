// Tab names: a post selects only a tab drawn now; a selection that cannot be saved never breaks the post.
// A test's own `ui.message` hook is not run by the kit for a Client post (probe: it heard nothing), so the
// "next is reached" guarantee is shown by the post settling and the pane still drawing.
import { expect, test } from 'claude-code/testing'
import { ID, ID2, PANE, flows, idOf, okShow, pickTab, selectedTab, stage } from './pane-test-kit'

const SITES = 'microsoft.web/sites'
const APPS = 'microsoft.app/containerapps'

for (const surface of ['terminal', 'desktop'] as const) {
  for (const key of ['microsoft.foo/unknown', '__proto__', 'constructor', 'toString']) {
    test(`a post naming no current tab (${key}) is ignored (${surface})`, async ($, on) => {
      const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
      await flows($, s)
      const ui = await $.ui.mount({ ...PANE, surface })
      await pickTab(ui, APPS)
      await ui.post({ select: key }, { in: 'tabs' })
      await ui.unmount()
      // A stored unknown key would fall back to the first tab (App Service): the pick stays Container Apps.
      const again = await $.ui.mount({ ...PANE, surface })
      expect(await selectedTab(again)).toBe(APPS)
      await again.unmount()
    })
  }

  test(`a selection that fails to save leaves the tab and the pane as they were (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    const refused: string[] = []
    on('state.set', (_: unknown, e: any, next: any) => {
      if (e.key !== 'selectedTab') return next(e)
      refused.push(e.key)
      // the write is refused, so $.state.set rejects inside selectTab
      return { deny: 'state refused' }
    })
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    await pickTab(ui, APPS)
    expect(refused).toEqual(['selectedTab'])
    expect(await selectedTab(ui)).toBe(SITES)
    await ui.unmount()
  })
}
