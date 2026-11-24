export type FieldFormat = 'url' | 'range' | 'cpuMem' | 'revision' | 'segment'

export type FieldSpec = {
  label: string
  path: string
  /** Second path: upper bound for `range`, fallback value otherwise. */
  path2?: string
  format?: FieldFormat
}

/** `color`: the type's tab and type line, a hex that reads on dark and light backgrounds. */
export type TypeSpec = { label: string; color: string; fields: FieldSpec[] }

/** Keyed by lowercase ARM type. */
export const CATALOG: Record<string, TypeSpec> = {
  'microsoft.app/containerapps': {
    label: 'Container Apps',
    color: '#378ADD',
    fields: [
      { label: 'URL', path: 'properties.configuration.ingress.fqdn', format: 'url' },
      { label: 'Revision', path: 'properties.latestRevisionName', format: 'revision' },
      { label: 'Replicas', path: 'properties.template.scale.minReplicas', path2: 'properties.template.scale.maxReplicas', format: 'range' },
      { label: 'CPU / memory', path: 'properties.template.containers[0].resources', format: 'cpuMem' },
      { label: 'Image', path: 'properties.template.containers[0].image' },
      { label: 'Environment', path: 'properties.environmentId', format: 'segment' },
    ],
  },
  'microsoft.web/sites': {
    label: 'App Service',
    color: '#1D9E75',
    fields: [
      { label: 'URL', path: 'properties.defaultHostName', format: 'url' },
      { label: 'State', path: 'properties.state' },
      { label: 'Plan', path: 'properties.serverFarmId', format: 'segment' },
      { label: 'Runtime', path: 'properties.siteConfig.linuxFxVersion', path2: 'kind' },
    ],
  },
  'microsoft.app/managedenvironments': {
    label: 'Container Apps environment',
    color: '#7F77DD',
    fields: [
      { label: 'Domain', path: 'properties.defaultDomain' },
      { label: 'Static IP', path: 'properties.staticIp' },
    ],
  },
  'microsoft.cognitiveservices/accounts': {
    label: 'Foundry',
    color: '#D4537E',
    fields: [
      { label: 'Endpoint', path: 'properties.endpoint', format: 'url' },
      { label: 'Kind', path: 'kind' },
      { label: 'SKU', path: 'sku.name' },
    ],
  },
  'microsoft.containerregistry/registries': {
    label: 'Container registry',
    color: '#D85A30',
    fields: [
      { label: 'Login server', path: 'properties.loginServer' },
      { label: 'SKU', path: 'sku.name' },
    ],
  },
  'microsoft.storage/storageaccounts': {
    label: 'Storage',
    color: '#BA7517',
    fields: [
      { label: 'Kind', path: 'kind' },
      { label: 'SKU', path: 'sku.name' },
      { label: 'Access tier', path: 'properties.accessTier' },
      { label: 'Blob', path: 'properties.primaryEndpoints.blob', format: 'url' },
    ],
  },
  'microsoft.cognitiveservices/accounts/projects': { label: 'Foundry project', color: '#ED93B1', fields: [] },
  'microsoft.search/searchservices': {
    label: 'AI Search',
    color: '#639922',
    fields: [
      { label: 'SKU', path: 'sku.name' },
      { label: 'Replicas', path: 'properties.replicaCount' },
      { label: 'Partitions', path: 'properties.partitionCount' },
      { label: 'Status', path: 'properties.status' },
    ],
  },
  'microsoft.operationalinsights/workspaces': {
    label: 'Log Analytics',
    color: '#85B7EB',
    fields: [
      { label: 'SKU', path: 'properties.sku.name' },
      { label: 'Retention (days)', path: 'properties.retentionInDays' },
    ],
  },
  // Key Vault: only the vault's address and SKU; secret values never reach a snapshot (redact).
  'microsoft.keyvault/vaults': {
    label: 'Key Vault',
    color: '#E24B4A',
    fields: [
      { label: 'Vault URI', path: 'properties.vaultUri', format: 'url' },
      { label: 'SKU', path: 'properties.sku.name' },
    ],
  },
  'microsoft.managedidentity/userassignedidentities': {
    label: 'Managed identity',
    color: '#5DCAA5',
    fields: [
      { label: 'Principal id', path: 'properties.principalId' },
      { label: 'Client id', path: 'properties.clientId' },
    ],
  },
  'microsoft.bing/accounts': {
    label: 'Bing',
    color: '#F0997B',
    fields: [
      { label: 'Kind', path: 'kind' },
      { label: 'SKU', path: 'sku.name' },
    ],
  },
}

export const FALLBACK_FIELDS: FieldSpec[] = [
  { label: 'SKU', path: 'sku.name' },
  { label: 'Kind', path: 'kind' },
]

/** Tabs and type lines of types not in the catalog. */
export const FALLBACK_COLOR = '#888780'

export const REGION_FIELD: FieldSpec = { label: 'Region', path: 'location' }
