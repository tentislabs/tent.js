// A program of its own that is the writer of an app with a large data file, and says how much memory it took
// to hand the file out.
// Run: node handsOut.ts <bundle folder> <data folder> <megabytes of rows>
// It says `{ port, key }` once it is open. On a line of its input it says `{ grew }`, the most megabytes that the
// memory of the program stood above what it held when it said the first line, and ends.
import { createInterface } from 'node:readline'
import { createEngine } from '../../index.ts'

const [bundle, dataFolder, megabytes] = process.argv.slice(2)
const key = 'k'.repeat(40)
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test', readers: [key], insecure: true })
// Rows of text that no two share, so that nothing of the file packs.
const piece = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(25_000)
for (let i = 0; i < Number(megabytes); i++)
  await app.write([{ add: 'words', values: { text: `${i} ${piece}` } }], { as: 'system' })
const { readFileSync } = await import('node:fs')
const { join } = await import('node:path')
const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
const before = process.memoryUsage().rss
let most = before
const watch = setInterval(() => {
  most = Math.max(most, process.memoryUsage().rss)
}, 20)
console.log(JSON.stringify({ port, key }))
createInterface({ input: process.stdin }).once('line', () => {
  clearInterval(watch)
  console.log(JSON.stringify({ grew: Math.round((most - before) / 1_048_576) }))
  void engine.close()
})
