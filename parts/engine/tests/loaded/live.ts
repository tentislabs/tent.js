// A program of its own that opens an app and says which files of the live hub and of the borrowed WebSocket part it
// loaded: before any live connection, after one with no network, and after one over a real connection.
// Run: node live.ts <bundle folder> <data folder>
import { readFileSync } from 'node:fs'
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

/** The files of the hub, of its messages and of the borrowed WebSocket part that were loaded so far. */
const ofTheHub = (): string[] =>
  loaded
    .filter((url) => /\/parts\/engine\/(hub|live|borrowed)\/|\/node_modules\/ws\//.test(url))
    .map((url) => url.replace(/^.*\/(parts\/engine|node_modules)\//, ''))

const [bundle, dataFolder] = process.argv.slice(2)
const { createEngine } = await import('../../index.ts')
const system = { kind: 'system' } as const
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
const origin = `http://localhost:${port}`

// The app is used in every way but a live one: written, read, called through the door, and asked for its health.
await app.call('addCard', { title: 'first', rank: 1 }, { as: system })
const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' }
const called = (await app.request(new Request(`${origin}/_t/call/allCards`, post))).status
const health = (await fetch(`${origin}/_t/health`)).status
// An opening that is refused loads nothing either: it never became a connection.
let refused = ''
try {
  app.live(new Request(`${origin}/_t/live`))
} catch (error) {
  refused = String(Reflect.get(Object(error), 'code'))
}
const before = ofTheHub()

// The first live connection, with no network: the hub is loaded, and nothing of the borrowed part.
const got: unknown[] = []
const end = app.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
end.each((message) => void got.push(message))
end.send({ t: 'watch', id: 'cards', query: 'allCards', input: {} })
for (let n = 0; n < 500 && got.length === 0; n++) await new Promise((done) => setTimeout(done, 10))
const noNetwork = ofTheHub()

// The first live connection over a real connection: the borrowed part is loaded.
const socket = new WebSocket(`ws://localhost:${port}/_t/live`, { headers: { origin } })
const heard: unknown[] = []
socket.addEventListener('message', (event) => void heard.push(JSON.parse(String(event.data))))
await new Promise((done, failed) => {
  socket.addEventListener('open', done)
  socket.addEventListener('error', failed)
})
socket.send(JSON.stringify({ t: 'watch', id: 'cards', query: 'allCards', input: {} }))
for (let n = 0; n < 500 && heard.length === 0; n++) await new Promise((done) => setTimeout(done, 10))
const overNetwork = ofTheHub()
socket.close()
end.close()
await engine.close()

console.log(
  `said: ${JSON.stringify({ called, health, refused, before, noNetwork, overNetwork, got: got.length, heard: heard.length })}`,
)
