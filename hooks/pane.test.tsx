import { expect, test } from 'claude-code/testing'
import { errorText, safeText } from './card'
import { failedMessage, fetchSnapshot, parseStored } from './snapshots'
import { until } from './scan-test-kit'
import { ID, ID2, PANE, flows, idOf, okShow, paneHas, pickTab, stage, start, update } from './pane-test-kit'

const APP = 'microsoft.app/containerapps'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`empty state (${surface})`, async ($) => {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /No resources yet. Run Scan./ })).toBeDefined()
    expect(await ui.find({ key: 'update' })).toBeDefined()
    expect(await ui.find({ key: 'scan' })).toBeDefined()
    await ui.unmount()
  })

  test(`a card per row with its snapshot (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    const res = await flows($, s)
    expect(res.text).toBe('Azure resources: update started.')
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^api$/ })).toBeDefined()
    await pickTab(ui, APP)
    await ui.press({ key: `props:${ID}` })
    await ui.unmount()
    const app = await $.ui.mount({ ...PANE, surface })
    expect(await app.find({ type: 'Text', text: /^web$/ })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /^italynorth$/ })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /● Succeeded/ })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /^Updated \d\d\/\d\d / })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /\{…\} 1 keys/ })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /\[…\] 3 items/ })).toBeDefined()
    expect(await app.find({ type: 'Text', text: /hunter2/ })).toBeUndefined()
    await app.unmount()
  })

  test(`Refresh press calls resource show for that id only (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
    await flows($, s)
    s.argvs.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: `refresh:${ID2}` })
    expect(s.argvs.length).toBe(1)
    expect(s.argvs[0]).toContain(ID2)
    expect(s.argvs[0]).toContain('show')
    await ui.unmount()
  })

  test(`login error shows Run az login (${surface})`, async ($, on) => {
    const s = stage(on, [ID], () => ({ exitCode: 1, stdout: '', stderr: 'ERROR: Please run az login to setup account.' }))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Run az login in a terminal/ })).toBeDefined()
    await ui.unmount()
  })

  test(`not-found keeps the card and shows Not found on Azure (${surface})`, async ($, on) => {
    const s = stage(on, [ID], () => ({ exitCode: 1, stdout: '', stderr: 'ERROR: (ResourceNotFound) The Resource could not be found.' }))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Not found on Azure/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /web/ })).toBeDefined()
    await ui.unmount()
  })

  test(`a failing run keeps the other cards (${surface})`, async ($, on) => {
    const s = stage(on, [ID, ID2], (argv) => (idOf(argv) === ID2 ? { exitCode: 1, stdout: '', stderr: 'ERROR: boom' } : okShow(idOf(argv))))
    await flows($, s)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Failed: ERROR: boom/ })).toBeDefined()
    await pickTab(ui, APP)
    await ui.unmount()
    const app = await $.ui.mount({ ...PANE, surface })
    expect(await app.find({ type: 'Text', text: /● Succeeded/ })).toBeDefined()
    await app.unmount()
  })
}

test('a stored snapshot of an older shape is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: { [ID]: { id: ID, at: 'x' } }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No resources yet/ }))?.text).toBe('No resources yet. Run Scan.')
  await ui.unmount()
})

test('a malformed id gives a failed snapshot without calling az', async () => {
  let calls = 0
  const $ = { process: { run: async () => (calls++, { exitCode: 0, stdout: '{}', stderr: '' }) } }
  const snap = await fetchSnapshot($, 'py', '/subscriptions/x;bad')
  expect(snap.error).toBe('failed:not a valid resource id')
  expect(calls).toBe(0)
})

test('a runner that throws gives a failed snapshot', async () => {
  const $ = { process: { run: async () => { throw new Error('spawn exploded') } } }
  expect((await fetchSnapshot($, 'py', ID)).error).toBe('failed:spawn exploded')
})

test('a timeout rejection shows Timed out', async () => {
  const $ = { process: { run: async () => { throw new Error('command timed out') } } }
  const snap = await fetchSnapshot($, 'py', ID)
  expect(snap.error).toBe('timeout')
  expect(errorText(snap.error!)).toBe('Timed out')
})

test('an unexpected error message is redacted', () => {
  const msg = failedMessage(new Error('boom AccountKey=abc123secret end'))
  expect(msg).not.toContain('abc123secret')
  expect(msg.startsWith('failed:')).toBe(true)
})

test('stored snapshots are validated and re-redacted entry by entry', () => {
  expect(parseStored({ x: 5 })).toEqual({})
  expect(parseStored('nope')).toEqual({})
  expect(parseStored(null)).toEqual({})
  const good = { id: ID, at: 't', error: 'timeout', extra: 'dropped' }
  const out = parseStored({ [ID]: good, bad: { id: 'not-an-arm-id', at: 't' }, b: { id: 1, at: 't' }, c: null })
  expect(Object.keys(out)).toEqual([ID])
  expect(out[ID]).toEqual({ id: ID, at: 't', error: 'timeout' })
  const dirty = parseStored({ [ID]: { id: ID, at: 't', data: { primaryKey: 'x', note: 'AccountKey=abc', location: 'italynorth' } } })
  const text = JSON.stringify(dirty)
  expect(text).not.toContain('primaryKey')
  expect(text).not.toContain('AccountKey=abc')
  expect(text).toContain('italynorth')
})

test('safeText replaces control and bidi characters and truncates', () => {
  const esc = String.fromCharCode(27)
  expect(safeText(`a${esc}[31mb`)).not.toContain(esc)
  expect(safeText('x\u202Ey\u200Bz\u0085w')).toBe('x y z w')
  const long = safeText('v'.repeat(500))
  expect(long.length).toBe(200)
  expect(long.endsWith('…')).toBe(true)
  expect(safeText('short')).toBe('short')
})

test('a card never renders an escape character and truncates long lines', async ($, on) => {
  const esc = String.fromCharCode(27)
  const s = stage(on, [ID], (argv) => ({
    exitCode: 0,
    stderr: '',
    stdout: JSON.stringify({ id: idOf(argv), location: `${esc}[31mred`, properties: { provisioningState: 'Succeeded', blob: 'v'.repeat(500) } }),
  }))
  await flows($, s)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map((n: { text?: string }) => n.text ?? '')
  expect(texts.some((t: string) => t.includes(esc))).toBe(false)
  expect(texts.some((t: string) => t.includes('red'))).toBe(true)
  expect(texts.every((t: string) => t.length < 400)).toBe(true)
  await ui.unmount()
})

test('a corrupt stored value is ignored at session start', async ($, on) => {
  const s = stage(on, [], () => okShow(ID))
  s.store.set('snapshots-1', { x: 5 })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No resources yet/ })).toBeDefined()
  await ui.unmount()
})

test('two concurrent updates: one refreshes, the other says already running', async ($, on) => {
  const s = stage(on, [ID, ID2], (argv) => okShow(idOf(argv)))
  await start($)
  const [a, b] = await Promise.all([update($), update($)])
  expect([a.text, b.text].sort()).toEqual(['Azure resources: an update is already running.', 'Azure resources: update started.'])
  await until(() => s.sets.length > 0)
  expect(s.argvs.length).toBe(2)
})

test('after a restart the pane shows azure.md rows and restored snapshots before any refresh', async ($, on) => {
  const s = stage(on, [ID], () => okShow(ID))
  s.store.set('snapshots-1', { [ID]: { id: ID, at: '2026-11-23T10:00:00Z', data: { location: 'italynorth' } } })
  await start($)
  // The stored snapshots load in the background, after session.start has answered.
  await until(async () => await paneHas($, /^Updated \d\d\/\d\d /))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^web$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Updated \d\d\/\d\d \d\d:\d\d$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No resources yet/ })).toBeUndefined()
  expect(s.argvs.length).toBe(0)
  await ui.unmount()
})
