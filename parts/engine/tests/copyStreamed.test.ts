import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundled, workFolder } from './apps.ts'

const program = fileURLToPath(new URL('./held/handsOut.ts', import.meta.url))

// How many megabytes of rows the writer holds, and the most that handing its data out may add to its memory.
const megabytes = 100
const mayGrow = 80

test('[29-2] the data of /_t/copy/data is answered as a stream, piece by piece: a writer whose memory is bounded hands out a data file of more than a hundred megabytes, and its memory grows by less than that', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const words = ['--max-old-space-size=256', program, bundle.folder, join(work, 'writer'), String(megabytes)]
  const child = spawn(process.execPath, words, { stdio: ['pipe', 'pipe', 'inherit'] })
  const gone = new Promise<void>((done) => child.once('exit', () => done()))
  // The program is ended by its number after three minutes, and when the test ends.
  const late = setTimeout(() => child.kill(), 180_000)
  t.after(async () => {
    clearTimeout(late)
    child.kill()
    await gone
  })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const said = async (): Promise<Record<string, unknown>> => JSON.parse(String((await lines.next()).value))
  const { port, key } = await said()
  // The data is asked for as a reader asks for it, over the network, and read to its end with nothing of it kept.
  const answer = await fetch(`http://127.0.0.1:${port}/_t/copy/data`, { headers: { authorization: `Bearer ${key}` } })
  assert.equal(answer.status, 200)
  const length = Number(answer.headers.get('content-length'))
  let arrived = 0
  for await (const piece of answer.body ?? []) arrived += piece.length
  assert.equal(arrived, length)
  assert.ok(length > megabytes * 1_000_000, `the data file holds ${length} bytes`)
  child.stdin.write('say\n')
  const { grew } = await said()
  assert.ok(
    Number(grew) < mayGrow,
    `handing ${Math.round(length / 1_048_576)} MB out added ${grew} MB to the memory of the writer`,
  )
})
