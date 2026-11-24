import type { Register } from 'claude-code'
import { readOptions } from './options'
import { observeRun, recordTargets } from './recorder'
import { registerPane } from './pane'
import { registerScan } from './scan-hooks'
import { showNewRows } from './new-rows'

export const register: Register = (on, options) => {
  const opts = readOptions(options)
  const python = opts.azPython
  registerScan(on, opts)
  registerPane(on, opts)
  // Pass-through: the command's result is returned untouched; recording runs after it, in the background,
  // new rows reach a pane that already shows this folder's rows and are refreshed in the background.
  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    observeRun($, e.command, () => next(e), (cwd, t) => recordTargets($, cwd, t, python, (list) => showNewRows($, cwd, list, opts))),
  ).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'PowerShell' }, ($, e, next) =>
    observeRun($, e.command, () => next(e), (cwd, t) => recordTargets($, cwd, t, python, (list) => showNewRows($, cwd, list, opts))),
  ).catch(($, e, next) => next(e))
}
