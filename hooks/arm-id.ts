// The one ARM id rule: ASCII path segments under /subscriptions, no `.` or `..` segment.
import { isAllowedGroupName } from './agent-guard'

export const ARM_ID_RE = /^\/subscriptions(?:\/[A-Za-z0-9._()-]+)+$/i
/** The longest id a reported row may have. */
export const MAX_ID = 512

export function isArmId(s: string): boolean {
  return ARM_ID_RE.test(s) && !/\/\.+(?=\/|$)/.test(s)
}

export type ArmFields = { name: string; type: string; resourceGroup: string; subscription: string }

const GUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const SEG = '[A-Za-z0-9._()-]+'
// /subscriptions/<guid>/resourceGroups/<group>/providers/<Namespace>/<type>/<name>[/<childType>/<childName>]...
const RESOURCE = new RegExp(`^/subscriptions/(${GUID})/resourceGroups/(${SEG})/providers/([A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)+)((?:/[A-Za-z0-9]+/${SEG})+)$`, 'i')

/** A resource's name (child: parent/child, as az gives it), type (child types included), group and subscription, read off a strict ARM id; undefined otherwise. */
export function armFields(id: string): ArmFields | undefined {
  if (id.length > MAX_ID || !isArmId(id)) return undefined
  const m = RESOURCE.exec(id)
  if (!m || !isAllowedGroupName(m[2]!)) return undefined
  const pairs = m[4]!.slice(1).split('/')
  const types = pairs.filter((_, i) => i % 2 === 0)
  // As az names a child resource: every name segment after the provider, joined with '/'.
  const names = pairs.filter((_, i) => i % 2 === 1)
  return { name: names.join('/'), type: [m[3]!, ...types].join('/'), resourceGroup: m[2]!, subscription: m[1]! }
}
