import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parse } from '../borrowed/vite.ts'
import { buildProject } from '../index.ts'
import type { FileReach } from '../read/arrows.ts'
import { readArrows } from '../read/arrows.ts'
import { neededBy } from '../read/needs.ts'
import type { Imported, Known } from '../read/reach.ts'
import { nothingInReach } from '../read/reach.ts'
import { scanOf } from '../read/scan.ts'
import { typeStored } from '../read/type.ts'
import { readViews } from '../read/views.ts'
import type { Node } from '../tree.ts'
import { kid, kids, walk } from '../tree.ts'
import { errorsOf } from './projects.ts'

/** What a file of a case gives its arrows: each word it imports from the framework as ours, and its own definitions. */
function reachOf(text: string, tsx: boolean): { tree: Node; reach: FileReach } {
  const tree = parse(text, tsx)
  const seen = scanOf(tree)
  const imports = new Map<string, Imported>()
  for (const one of seen.imports)
    imports.set(one.local, one.from.startsWith('tentjs') ? { ours: one.name } : { other: one.from })
  const own = new Map<string, Known>()
  for (const one of seen.declared)
    if (one.name !== undefined) own.set(one.exportName, { kind: one.word, definition: one.name })
  return { tree, reach: { imports, own, tops: new Map() } }
}

/** The one definition of a case, as its file writes it. */
function declaredIn(text: string, tsx: boolean) {
  const { tree, reach } = reachOf(text, tsx)
  const [declared] = scanOf(tree).declared
  assert.ok(declared, 'the case declares its definition')
  return { declared, reach }
}

test('[14-7] a screen file that imports useAgent or useRun stores the part of the page code that follows a run in needs, under the name its one home gives it', () => {
  for (const hook of ['useAgent', 'useRun']) {
    const imports = new Map<string, Imported>([[hook, { ours: hook }]])
    assert.ok(
      neededBy({ imports, own: new Map(), tops: new Map() }).includes('agent'),
      `${hook}: needs holds ${JSON.stringify(neededBy({ imports, own: new Map(), tops: new Map() }))}`,
    )
  }
})

test('[14-7] a screen whose view is a function of its file stores the parts and the headers that its file needs, as one whose view is an arrow written in place does', () => {
  const file = (view: string) => `
import { screen, useMicrophone, Form } from 'tentjs/ui'

function Recorder() {
  const mic = useMicrophone()
  return <Form call={undefined}><button onClick={() => mic.start()}>Record</button></Form>
}

export const recordScreen = screen('recordScreen', { path: '/record', access: 'anyone', view: ${view} })
`
  const read = (view: string) => {
    const text = file(view)
    const { declared, reach } = declaredIn(text, true)
    return readViews(declared, reach, text).views
  }
  const inPlace = read('() => <Recorder />')
  assert.deepEqual([inPlace.needs, inPlace.opens], [['form', 'mic'], { microphone: true }])
  const named = read('Recorder')
  assert.deepEqual(
    [named.needs, named.opens],
    [['form', 'mic'], { microphone: true }],
    'a view that is a function of the file needs what its file imports too',
  )
})

test('[12-3a] a body that calls a member of the handle workspaces is plain, as a call of any other handle is', () => {
  const text = `
import { action, workspaces } from 'tentjs'

export const listAll = action('listAll', { access: 'anyone', run: async () => workspaces.list() })
`
  const { declared, reach } = declaredIn(text, false)
  const read = readArrows(declared, reach, text)
  assert.equal(read.why, undefined, `the run was made code: ${JSON.stringify(read.why)}`)
  assert.deepEqual(read.bodies.run, [{ return: { call: { builtin: 'workspaces.list' }, args: [] } }])
})

test('[25-11] a new approval that changes only the host that signs people in at an outside server is a new version, as the description names what the bundle holds of it', async () => {
  const folder = join(import.meta.dirname, '..', '..', '..', 'results', 'build', 'review-mcp-host')
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n",
  )
  writeFileSync(
    join(folder, 'services.ts'),
    "import { service } from 'tentjs'\n\nexport const tools = service('tools', { mcp: { command: ['node', 'server.js'] } })\n",
  )
  const approved = (host: string): string => `${JSON.stringify({ tools: { host, tools: {} } })}\n`
  const versions: string[] = []
  for (const host of ['signin.one.example', 'signin.two.example']) {
    writeFileSync(join(folder, 'mcp.lock.json'), approved(host))
    const made = await buildProject(folder, { for: 'release', out: join(folder, `bundle-${versions.length}`) })
    assert.deepEqual(errorsOf(made.findings), [])
    assert.equal(
      readFileSync(join(made.bundleFolder, 'description.json'), 'utf8').includes(host),
      true,
      'the description of the bundle holds the host',
    )
    assert.equal(existsSync(join(made.bundleFolder, 'mcp', 'hosts.json')), false, 'no file of its own holds it')
    versions.push(made.versionId)
  }
  assert.notEqual(versions[0], versions[1], 'the two bundles hold other hosts and are one version')
})

test('[12-3a] a type handed to a word that takes one is stored with a number below zero among its options, which is a literal written in place', () => {
  const text = `
import { number } from 'tentjs'

const typed = number({ min: -5, max: 5 })
`
  const { tree, reach } = reachOf(text, false)
  let call: Node | undefined
  walk(tree, (node) => {
    if (node.type === 'VariableDeclarator') call = kid(node, 'init')
  })
  assert.ok(call && kids(call, 'arguments').length === 1, 'the case holds the call of the type word')
  assert.deepEqual(typeStored(call, { ...nothingInReach(), imports: reach.imports }), {
    kind: 'number',
    min: -5,
    max: 5,
  })
})
