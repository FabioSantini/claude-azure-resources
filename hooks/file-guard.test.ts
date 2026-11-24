import { expect, test } from 'claude-code/testing'
import { judgeFileCall } from './file-guard'

const CWD = 'C:/proj'
const read = (file_path: unknown, cwd = CWD) => judgeFileCall('Read', { file_path }, cwd)
const glob = (input: Record<string, unknown>) => judgeFileCall('Glob', input, CWD)

test('Read inside the project folder passes', () => {
  for (const p of ['C:/proj/CLAUDE.md', 'C:\\proj\\docs\\deploy.md', 'c:/PROJ/infra/main.bicep', 'C:/proj/./README.md', 'C:/proj/.github/workflows/ci.yml', 'C:/proj/azure.md']) {
    expect(read(p)).toBeUndefined()
  }
})

test('Read outside the project folder, odd or of a secret is denied', () => {
  const bad = [
    undefined, 42, '', 'C:/proj/.env', 'C:/proj/sub/.env.local', 'C:/proj/prod.env', 'C:/proj/certs/a.pem', 'C:/proj/../x.txt',
    'C:/proj/sub/../../x.txt', 'C:/Windows/win.ini', 'C:/project2/a.md', 'C:/proj/.git/config', 'C:/proj/a/.azure/x.json',
    'C:/proj/.ssh/id_rsa', 'C:/proj/id_ed25519.pub', 'C:/proj/k.KEY', 'C:/proj/c.pfx', 'C:/proj/c.p12', 'C:/proj/db.kdbx',
    'C:/proj/my-Secrets.json', 'C:/proj/credentials.json', 'C:/proj/.npmrc', 'C:/proj/.pypirc', 'C:/proj/.netrc',
    'C:/proj/.git-credentials', 'C:/proj/app.PublishSettings', 'C:/proj/fn/local.settings.json', 'C:/proj/vault/a.txt',
    'C:/proj/secrets/a.txt', 'C:/proj/.aws/config', 'C:/proj/.env:stream', 'C:/proj/ENV~1', 'C:/proj/.env.', 'C:/proj/.env ',
    'C:/proj/a.txt:secret', '//server/share/x',
  ]
  for (const p of bad) expect(read(p)).toBeDefined()
})

test('Read is an allow-list by extension: project text files only', () => {
  const ok = ['a.md', 'a.TXT', 'main.bicep', 'main.tf', 'ci.yml', 'azure.yaml', 'arm.json', 'deploy.ps1', 'deploy.sh', 'pyproject.toml', 'Dockerfile', 'makefile']
  for (const n of ok) expect(read(`C:/proj/${n}`)).toBeUndefined()
  const bad = ['a.exe', 'a.py', 'a.cs', 'history', 'a.md.bak', 'a.bicepparam', 'Dockerfile.dev', 'a.yml.swp', 'noext', 'a.db', 'a.pdf']
  for (const n of bad) expect(read(`C:/proj/${n}`)).toBeDefined()
})

test('the widened secret denylist wins over the allow-list', () => {
  const names = [
    '.env', '.envrc.sh', '.env-prod.json', '.env_local.txt', 'prod.env', '.credentials.json', 'my-credential.md', 'appsettings.json',
    'appsettings.Development.json', 'local.settings.json', 'terraform.tfstate.json', 'x.tfstate.backup.json', 'prod.tfvars.json',
    'secret.yml', 'MySecrets.md', 'key.ppk.txt', 'id_ecdsa.txt', 'id_dsa.md', 'id_rsa.json', 'store.jks.json', 'a.keystore.yml',
    '.htpasswd.txt', '.pgpass.txt', '.npmrc.json', '.pypirc.toml', '.netrc.md', '.git-credentials.txt', 'app.publishsettings.json',
  ]
  for (const n of names) expect(read(`C:/proj/${n}`)).toBeDefined()
  for (const n of ['.env', '.npmrc', '.pypirc', '.netrc', '.htpasswd', '.pgpass', 'k.ppk', 'k.jks', 'k.keystore', 'id_ed25519']) {
    expect(read(`C:/proj/${n}`)).toBeDefined()
  }
})

test('secret folders below the project are denied', () => {
  for (const f of ['.git', '.azure', '.ssh', '.aws', '.kube', '.docker', '.gnupg', '.config', '.claude', 'vault', 'secrets', 'node_modules', '.Claude']) {
    expect(read(`C:/proj/${f}/a.md`)).toBeDefined()
    expect(glob({ pattern: '*', path: `C:/proj/${f}` })).toBeDefined()
  }
})

test('Glob patterns may not hold braces', () => {
  for (const pattern of ['.{.,x}/*', '{.,x}./*', '*.{yml,yaml}', 'a}', '{a']) expect(glob({ pattern, path: 'C:/proj' })).toBeDefined()
})

test('a relative Read path is denied: the guard never guesses the folder the tool resolves it from', () => {
  for (const p of ['docs/a.md', './a.md', '../x.txt', '.env', 'C:a.md']) expect(read(p)).toBeDefined()
})

test('paths are case-sensitive on a POSIX project folder', () => {
  expect(read('/home/u/proj/a.md', '/home/u/proj')).toBeUndefined()
  expect(read('/home/u/PROJ/a.md', '/home/u/proj')).toBeDefined()
})

test('a secret-looking folder above the project folder does not deny it', () => {
  expect(read('C:/vault/proj/a.md', 'C:/vault/proj')).toBeUndefined()
})

test('Glob needs an absolute path inside the project, not a secret folder', () => {
  expect(glob({ pattern: '**/*.bicep', path: 'C:/proj' })).toBeUndefined()
  expect(glob({ pattern: '*', path: 'C:/proj/infra' })).toBeUndefined()
  expect(glob({ pattern: '**/*.bicep' })).toBeDefined()
  for (const path of ['C:/', 'C:/proj/..', 'infra', 'C:/proj/.git', 'C:/proj/secrets', 'C:/proj/.ssh', 'C:/Windows', 7, '']) {
    expect(glob({ pattern: '*', path })).toBeDefined()
  }
})

test('Glob patterns stay below the path: no .., no absolute prefix, no ~', () => {
  expect(glob({ pattern: '**/.env*', path: 'C:/proj' })).toBeUndefined()
  expect(glob({ pattern: '.github/workflows/*.yml', path: 'C:/proj' })).toBeUndefined()
  const bad = ['../*', 'a/../../b', '..', 'a\\..\\b', '/etc/*', '\\x', '//srv/x', '\\\\srv\\x', 'C:/x', 'c:x', 'D:\\x', '~/x', 'a/~b', '{x,../y}', '{a,/etc}/*', '*.{yml,C:/x}', '', 7, undefined]
  for (const pattern of bad) expect(glob({ pattern, path: 'C:/proj' })).toBeDefined()
})

test('other tools are not judged here', () => {
  expect(judgeFileCall('Bash', { command: 'x' }, CWD)).toBeUndefined()
  expect(judgeFileCall('Grep', { pattern: 'x', path: 'C:/proj/.env' }, CWD)).toBeUndefined()
})
