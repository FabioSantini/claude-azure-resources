// Tab names: a Client that fails on one surface gives way to the buttons there, and only there.
// The test kit cannot raise `ui.fault` (`$.ui.fault` is not a function), and the module this file imports is not
// the instance the mounted plugin runs (marking a fault here left the mounted desktop pane with its Client), so the
// flag is tested through the functions the `ui.fault` hook and `tabRow` call.
import { expect, test } from 'claude-code/testing'
import { onTabFault, usesClient } from './tab-row'

const fault = (surface: string, module = 'hooks/tab-names-client.tsx') => ({ surface, element: 'tabs', module })

test('only terminal and desktop draw the tab row as a Client', () => {
  expect(['terminal', 'desktop', 'mobile', 'vscode'].map(usesClient)).toEqual([true, true, false, false])
})

test("another module's or element's fault changes nothing", () => {
  onTabFault(fault('terminal', 'hooks/other.tsx'))
  onTabFault({ ...fault('terminal'), element: 'other' })
  expect(usesClient('terminal')).toBe(true)
})

test('a fault of the names on desktop brings the buttons there, the terminal keeps its Client', () => {
  onTabFault(fault('desktop'))
  expect(usesClient('desktop')).toBe(false)
  expect(usesClient('terminal')).toBe(true)
})
