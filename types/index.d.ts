export type IndexRow = {
  id: string
  name: string
  type: string
  resourceGroup: string
  subscription: string
  source: 'hook' | 'agent'
  firstSeen: string
  lastSeen: string
}

export type NewRow = Omit<IndexRow, 'firstSeen' | 'lastSeen'>

export type IndexDoc = {
  before: string
  rows: IndexRow[]
  badRows: string[]
  after: string
}

/** The last answer of Azure for one resource. `error` is a code (`not-logged-in`, `not-found`, `timeout`) or `failed:<message>`. */
export type Snapshot = { id: string; at: string; data?: unknown; error?: string }

export type Busy = 'idle' | 'update' | 'scan'

declare module 'claude-code' {
  interface PluginState {
    'azure-resources': {
      snapshots: Shaped<Record<string, Snapshot>>
      rows: Shaped<IndexRow[]>
      busy: Shaped<Busy>
      selectedTab: Shaped<string>
      expanded: Shaped<string[]>
    }
  }
}
