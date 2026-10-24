// A program of its own that opens an app which holds no screen, asks it for pages, and says what it loaded by then.
// Run: node noScreens.ts <bundle folder> <data folder>
import { registerHooks } from 'node:module'

// The runtime tells of every file that a program loads, before it is loaded: the program keeps their addresses.
const loaded: string[] = []
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url)
    return nextLoad(url, context)
  },
})

const [bundle, dataFolder] = process.argv.slice(2)
const { createEngine } = await import('../../index.ts')
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const { readFileSync } = await import('node:fs')
const { join } = await import('node:path')
const origin = `http://localhost:${JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port}`
const said: Record<string, unknown> = { engine: loaded.some((url) => url.endsWith('/parts/engine/open.ts')) }
const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' }
said.called = (await app.request(new Request(`${origin}/_t/call/publicTags`, post))).status
// Every address of a page is asked for: none is there, and none loads what draws one.
said.screens = []
for (const path of ['/', '/orders/42', '/_t/b/browser/page.js'])
  Object(said.screens).push((await app.request(new Request(origin + path))).status)
said.read = (await app.request(new Request(`${origin}/_t/read/publicTags`, post))).status
said.page = await app.page('/').then(
  () => 'answered',
  (error) => Reflect.get(Object(error), 'code'),
)
said.loaded = loaded
  .filter((url) => /\/parts\/screens\/|\/parts\/engine\/pages\/answer\.ts$|\/node_modules\/(react|react-dom|scheduler)\//.test(url))
  .map((url) => url.replace(/^.*\/(parts|node_modules)\//, ''))
await engine.close()
console.log(`said: ${JSON.stringify(said)}`)
