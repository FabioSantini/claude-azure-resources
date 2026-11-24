import { expect, test } from 'claude-code/testing'
import { REDACTED, redact, redactString } from './redact'

const ARM = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.App/containerApps/api'

const app = () => ({
  id: ARM,
  name: 'api',
  type: 'Microsoft.App/containerApps',
  location: 'italynorth',
  properties: {
    template: {
      containers: [
        { name: 'web', image: 'acr.azurecr.io/web:1', env: [{ name: 'X', value: 'v' }] },
      ],
    },
    configuration: { secrets: [{ name: 's', value: 'v' }], ingress: { fqdn: 'api.example.com' } },
  },
})

test('drops env values inside containers', () => {
  const out = redact(app()) as any
  const c = out.properties.template.containers[0]
  expect('env' in c).toBe(false)
  expect(c.image).toBe('acr.azurecr.io/web:1')
  expect(c.name).toBe('web')
})

test('drops secrets array', () => {
  const out = redact(app()) as any
  expect('secrets' in out.properties.configuration).toBe(false)
  expect(out.properties.configuration.ingress.fqdn).toBe('api.example.com')
})

test('drops primaryKey and connectionString at any depth', () => {
  const out = redact({
    properties: {
      nested: [{ primaryKey: 'a', key1: 'b', accessKeys: ['c'], connectionString: 'd', ok: 1 }],
      adminPassword: 'p',
      sasToken: 't',
      clientCredential: 'c',
      appSettings: [{ name: 'a', value: 'b' }],
      connectionStrings: [],
      sasUrl: 'u',
    },
  }) as any
  expect(out).toEqual({ properties: { nested: [{ ok: 1 }] } })
})

test('masks AccountKey inside a string', () => {
  const sa = {
    properties: {
      endpoint: 'DefaultEndpointsProtocol=https;AccountKey=abc;EndpointSuffix=core.windows.net',
      primaryEndpoints: { blob: 'https://x.blob.core.windows.net/?sv=2022&sig=zzz' },
      sas: 'SharedAccessSignature sr=1',
      pem: '-----BEGIN PRIVATE KEY-----',
      long: 'A'.repeat(44),
      hex: 'a'.repeat(32),
    },
  }
  const out = redact(sa) as any
  expect(out.properties.endpoint).toBe(REDACTED)
  expect(out.properties.primaryEndpoints.blob).toBe(REDACTED)
  expect(out.properties.sas).toBe(REDACTED)
  expect(out.properties.pem).toBe(REDACTED)
  expect(out.properties.long).toBe(REDACTED)
  expect(out.properties.hex).toBe(REDACTED)
  expect(redactString('https://x/?a=1&sig=q')).toBe(REDACTED)
  expect(redactString('plain text')).toBe('plain text')
})

test('keeps id name type location sku tags', () => {
  const input = {
    id: ARM,
    name: 'api',
    type: 'Microsoft.App/containerApps',
    kind: 'app',
    location: 'italynorth',
    sku: { name: 'S1', tier: 'Standard' },
    tags: { owner: 'me' },
    properties: { state: 'Running' },
  }
  expect(redact(input)).toEqual(input)
})

test('keeps ARM ids', () => {
  const real =
    '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-demo/providers/Microsoft.App/containerApps/my-app'
  expect(redactString(real)).toBe(real)
  expect((redact({ id: ARM }) as any).id).toBe(ARM)
})

test('masks ARM-looking strings that carry secret markers', () => {
  expect(redactString(ARM + '?sig=abc')).toBe(REDACTED)
  expect(redactString(ARM + ';AccountKey=abc')).toBe(REDACTED)
})

test('masks real Azure secret shapes', () => {
  const shapes = [
    'Server=tcp:x;User ID=a;Password=hunter2;',
    'Endpoint=sb://x/;SharedAccessKeyName=n;SharedAccessKey=abc=',
    'x.redis.cache.windows.net:6380,password=p,ssl=True',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghij',
    'https://f.azurewebsites.net/api/x?code=abc',
    'Data Source=x;Pwd=p',
    'AccessKey=abc',
  ]
  for (const s of shapes) expect(redactString(s)).toBe(REDACTED)
  expect((redact({ properties: { value: shapes[0], url: shapes[4] } }) as any).properties).toEqual({
    value: REDACTED,
    url: REDACTED,
  })
})

test('drops keys with separators and common secret names', () => {
  const input = {
    properties: {
      connection_string: 'a',
      'Connection-String': 'b',
      access_key: 'c',
      client_secret: 'd',
      primaryMasterKey: 'e',
      adminPassword: 'f',
      clientSecret: 'g',
      ok: 'fine',
    },
  }
  expect(redact(input)).toEqual({ properties: { ok: 'fine' } })
})

test('does not mutate input', () => {
  const input = app()
  const copy = JSON.parse(JSON.stringify(input))
  const out = redact(input)
  expect(input).toEqual(copy)
  expect(out).not.toBe(input)
})

test('handles null, numbers, arrays', () => {
  expect(redact(null)).toBe(null)
  expect(redact(undefined)).toBe(undefined)
  expect(redact(5)).toBe(5)
  expect(redact(true)).toBe(true)
  expect(redact([1, 'a', null, { token: 'x', n: 2 }])).toEqual([1, 'a', null, { n: 2 }])
})

test('keep list wins over drop rules but values are still redacted', () => {
  const out = redact({ tags: { a: 'AccountKey=zz' }, name: 'k' }) as any
  expect(out.tags.a).toBe(REDACTED)
  expect(out.name).toBe('k')
})

test('masks long entropy runs inside sentences but keeps GUIDs and paths', () => {
  expect(redactString('use key ' + 'Ab1+'.repeat(11) + ' now')).toBe(REDACTED)
  for (const guid of ['11111111-1111-1111-1111-111111111111', 'abcdef01-2345-6789-abcd-ef0123456789']) {
    expect(redactString(guid)).toBe(guid)
  }
  expect(redactString('https://x.example.com/api/v1/items')).toBe('https://x.example.com/api/v1/items')
})

test('masks URI credentials and token query params', () => {
  expect(redactString('https://u:p@host/x')).toBe(REDACTED)
  expect(redactString('https://host/x?access_token=x')).toBe(REDACTED)
  expect(redactString('https://host/x?a=1&code=x')).toBe(REDACTED)
})

test('drops authorization and certificate keys', () => {
  const out = redact({ properties: { Authorization: 'a', certData: 'b', pfxBlob: 'c', signature: 'd', ok: 1 } })
  expect(out).toEqual({ properties: { ok: 1 } })
})

test('strict ARM id exemption', () => {
  expect(redactString('/subscriptions/s/resourceGroups/g?sig=x')).toBe(REDACTED)
  expect(redactString('/subscriptions/s/resourceGroups/g')).toBe('/subscriptions/s/resourceGroups/g')
  const longBad = '/subscriptions/s/' + 'A'.repeat(50) + '|x'
  expect(redactString(longBad)).toBe(REDACTED)
})

test('__proto__ key survives as an own key without polluting', () => {
  const out = redact(JSON.parse('{"__proto__":{"x":1}}')) as any
  expect(Object.keys(out)).toEqual(['__proto__'])
  expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  expect(({} as any).x).toBe(undefined)
})

test('regex escapes work: JWT, URI credentials, base64 with slash, blob URL', () => {
  expect(redactString('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghij')).toBe(REDACTED)
  expect(redactString('see eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0. here')).toBe(REDACTED)
  expect(redactString('https://u:p@host/x')).toBe(REDACTED)
  const b64 = 'Zk9v/' + 'aB3+x7/Qw9='.repeat(7) + 'Zm9vYmFyYmF6cXV4dXVleA=='
  expect(b64.length).toBeGreaterThan(80)
  expect(redactString(b64)).toBe(REDACTED)
  const blob = 'https://acct.blob.core.windows.net/container/file.txt'
  expect(redactString(blob)).toBe(blob)
})

test('round 2: loose ARM exemption and query parameter names', () => {
  expect(redactString('/subscriptions/s/' + 'Ab1+'.repeat(13))).toBe(REDACTED)
  expect(redactString('/subscriptions/s/' + 'a'.repeat(50))).toBe(REDACTED)
  expect(redactString('https://h/x?api-key=x')).toBe(REDACTED)
  expect(redactString('https://h/x?sv=1&se=2&sp=r&sr=b&skoid=a&sktid=b&sig=x')).toBe(REDACTED)
  expect(redactString('https://h/x?X-Amz-Signature=x')).toBe(REDACTED)
  expect(redactString('https://h/x?page=2&sort=name')).toBe('https://h/x?page=2&sort=name')
})

test('round 2: key normalisation cannot widen the keep list', () => {
  const out = redact({ pass_word: 'a', TaGs: { a: 'b' }, 'caf\u00e9': 'c', ok: 1 }) as any
  expect(Object.keys(out).sort()).toEqual(['TaGs', 'ok'])
  expect(Object.keys(redact({ 't-a-g-s': 1 }) as any)).toEqual(['t-a-g-s'])
  expect(Object.keys(redact({ 'secret-': 1, 'to_ken': 1 }) as any)).toEqual([])
})
