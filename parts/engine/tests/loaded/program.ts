// A program of its own that opens an app and says which files of the engine it loaded by then.
// Run: node program.ts <bundle folder> <data folder> <alone | readers | lease | kept | near | took | back>
import { registerHooks } from 'node:module'
import { join } from 'node:path'

// The runtime tells of every file that a program loads, before it is loaded: the program keeps their addresses.
const loaded: string[] = []
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url)
    return nextLoad(url, context)
  },
})

/** The files of the link between machines, and of the borrowed WebSocket part, that were loaded so far. */
const ofTheLink = (): string[] =>
  loaded
    .filter((url) => /\/parts\/engine\/(copy|borrowed)\/|\/node_modules\/ws\//.test(url))
    .map((url) => url.replace(/^.*\/(parts\/engine|node_modules)\//, ''))

const [bundle, dataFolder, how] = process.argv.slice(2)
const { createEngine } = await import('../../index.ts')
const system = { kind: 'system' } as const
const key = 'k'.repeat(40)
const engine = createEngine({ port: 0 })
const said: Record<string, unknown> = { engine: loaded.some((url) => url.endsWith('/parts/engine/open.ts')) }

if (how === 'alone') {
  // An app on one machine: it is opened with no `own`, no `readers` and no `reads`, and is used in every way.
  const app = await engine.open(bundle, { dataFolder, mode: 'test' })
  const { readFileSync } = await import('node:fs')
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  await app.write([{ add: 'tags', values: { name: 'a tag' } }], { as: system })
  said.read = await app.read({ from: 'tags' }, { as: system })
  said.called = await app.call('publicTags', {}, { as: system })
  const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' }
  said.asked = (await app.request(new Request(`http://localhost:${port}/_t/call/publicTags`, post))).status
  said.health = (await fetch(`http://localhost:${port}/_t/health`)).status
  // The addresses of the link are not found on an app that lets no reader join, with a key and with none.
  const keyed = { headers: { authorization: `Bearer ${key}` } }
  said.link = (await fetch(`http://localhost:${port}/_t/copy/data`, keyed)).status
  said.versions = (await fetch(`http://localhost:${port}/_t/copy/versions`)).status
  // A header that only a reader sets is refused, as on any writer.
  const made = { ...post, headers: { ...post.headers, 'tent-for': '1.2.3.4; https; x' } }
  said.made = (await app.request(new Request(`http://localhost:${port}/_t/call/publicTags`, made))).status
  said.role = app.role
  said.at = app.at()
  said.machines = app.machines()
  said.loaded = ofTheLink()
  await app.close()
} else if (how === 'lease') {
  // An app that has a lease, opened with no `own`, no `readers` and no `reads`: its writer asks the lease.
  const leased = createEngine({ port: 0, makers: { lease: () => ({ hold: () => true }) } })
  const app = await leased.open(bundle, { dataFolder, mode: 'test' })
  await app.write([{ add: 'tags', values: { name: 'a tag' } }], { as: system })
  said.after = ofTheLink()
  said.role = app.role
  await app.close()
  await leased.close()
} else if (how === 'kept' || how === 'near' || how === 'took' || how === 'back') {
  // An app whose data says that it had machines. It ran alone first, and loaded nothing of the link then.
  const alone = createEngine({ port: 0 })
  const first = await alone.open(bundle, { dataFolder, mode: 'test' })
  await first.write([{ add: 'tags', values: { name: 'a tag' } }], { as: system })
  said.before = ofTheLink()
  await first.close()
  await alone.close()
  // What a machine among others writes of itself into its data, each kind alone.
  const { setHere, sqliteStore } = await import('../../../data/index.ts')
  const fields = {
    kept: { kept: true as const },
    near: { near: ['01m4tsszkrfvcb90stjjyhadr1'] },
    took: { took: { from: 'https://old.tent.test', answered: true } },
    back: { back: { reader: '01m4tsszkrfvcb90stjjyhadr1', n: 99 } },
  }
  const store = sqliteStore()
  store.open(dataFolder)
  try {
    setHere(store, fields[how])
  } finally {
    store.close()
  }
  said.between = ofTheLink()
  const app = await engine.open(bundle, { dataFolder, mode: 'test' })
  said.after = ofTheLink()
  said.role = app.role
  await app.close()
} else {
  // A writer that lets a reader join: the files of the link are loaded, and the borrowed part at the first link.
  const app = await engine.open(bundle, { dataFolder, mode: 'test', readers: [key], insecure: true })
  const { readFileSync } = await import('node:fs')
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  await app.write([{ add: 'tags', values: { name: 'a tag' } }], { as: system })
  said.before = ofTheLink()
  const second = createEngine({ port: 0 })
  const reader = await second.read({
    from: `http://127.0.0.1:${port}`,
    key,
    dataFolder: `${dataFolder}-reader`,
    insecure: true,
  })
  for (let i = 0; i < 600 && app.machines().length < 2; i++) await new Promise((done) => setTimeout(done, 10))
  said.machines = app.machines().length
  said.after = ofTheLink()
  await reader.close()
  await second.close()
  await app.close()
}
await engine.close()
console.log(`said: ${JSON.stringify(said)}`)
process.exit(0)
