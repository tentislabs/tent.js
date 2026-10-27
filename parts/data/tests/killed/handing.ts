// A program that is killed between a commit and the handing on of that write to a sink, and started again: each
// start is told by `start` where the data stands, and the sink keeps the number it holds in a file of its own.
// Run: node handing.ts <data folder>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { connected, sqliteStore } from '../../index.ts'
import { killedAt } from '../../../../rig/kill.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const entries = { name: 'entries', columns: { k: { kind: 'number', whole: true } }, indexes: [], unique: [], search: [] }
const held = join(folder, 'sink.txt')
const holds = () => (existsSync(held) ? Number(readFileSync(held, 'utf8')) : 0)

const plain = sqliteStore()
plain.open(folder)
if (!plain.layout().some((one) => one.name === 'entries'))
  plain.write(() => plain.applyTableChanges([{ do: 'addTable', table: 'entries', layout: entries }]))

let gap = false
const sink = {
  // The sink answers the number it holds. Where the data stands at another, a write was committed and not handed on.
  start(n) {
    console.log(`start: the data stands at ${n}, the sink holds ${holds()}`)
    gap = n !== holds()
    // A new backup is where the copy starts again: this sink takes the number of the data as its own.
    writeFileSync(held, String(n))
    return n
  },
  // A slow sink: it takes a write long after it was handed it, so the kill arrives first.
  wrote: (change) =>
    new Promise((resolve) => setTimeout(resolve, 30_000)).then(() => writeFileSync(held, String(change.n))),
}
const store = connected(plain, [entries], { sink })
await new Promise((resolve) => setImmediate(resolve))

if (gap) {
  store.close()
  console.log('done: the gap was shown')
} else {
  store.write((tx) => tx.add('entries', { k: holds() + 1 }, system))
  // The write is committed and the sink has not taken it: the kill is to arrive now.
  killedAt('mid')
}
