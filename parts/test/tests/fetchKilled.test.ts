import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Socket } from 'node:net'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { createEngine } from '../../engine/index.ts'
import { addOrder, addTeam, dataPlace, deskBundle, teamFilesIn, titlesOf } from './desks.ts'

const key = 'k'.repeat(40)

test('[29-2] a reader that the system kills while it fetches the data starts again with no half file in place, fetches everything anew, and holds what its writer holds', async (t) => {
  const engine = createEngine({ port: 0 })
  const sockets = new Set<Socket>()
  // What stands between the reader and its writer: it passes every byte on, but for a request for the file of one
  // tenant while it holds those back, which it never passes on. The second start of the reader asks it to let go.
  let holding = true
  const asked = { data: 0, files: 0, heldBack: 0 }
  const between = createServer((client) => {
    let stalled = false
    sockets.add(client)
    const told = (chunk: Buffer): void => {
      const text = chunk.toString('latin1')
      if (text.startsWith('GET /release ')) {
        holding = false
        client.end('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n')
        return
      }
      if (text.startsWith('GET /_t/copy/data ')) asked.data++
      if (text.startsWith('GET /_t/copy/data?table=')) {
        asked.files++
        if (holding) {
          asked.heldBack++
          stalled = true
        }
      }
      if (!stalled) writer.write(chunk)
    }
    const writer = connect(Number(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port), '127.0.0.1')
    sockets.add(writer)
    client.on('data', told)
    writer.on('data', (chunk) => void client.write(chunk))
    for (const [one, other] of [
      [client, writer],
      [writer, client],
    ]) {
      one.on('error', () => undefined)
      one.on('close', () => {
        sockets.delete(one)
        other.destroy()
      })
    }
  })
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise((done) => between.close(done))
    await engine.close()
  })
  const dataFolder = dataPlace(t)
  const writer = await engine.open(await deskBundle(t), {
    dataFolder,
    mode: 'test',
    address: '*',
    readers: [key],
    insecure: true,
  })
  const teams: string[] = []
  for (let i = 0; i < 6; i++) {
    teams.push(await addTeam(writer, `team ${i}`))
    await addOrder(writer, teams[i], `the order of ${i}`)
    await addOrder(writer, teams[i], `a second order of ${i}`)
  }
  await new Promise<void>((done) => between.listen(0, '127.0.0.1', done))
  const at = between.address()
  const from = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}`
  const readerFolder = join(dataFolder, '..', 'reader')
  const program = join(import.meta.dirname, 'killed', 'reader.ts')
  const killed = await runKilled(program, { times: 1, when: 'fetching', seed: 29, args: [from, key, readerFolder] })
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const told = JSON.parse(/^told: (.*)$/m.exec(again.out)?.[1] ?? '{}')
  // The kill fell while the files of the tenants were fetched: the shared file had arrived, and was not in place.
  assert.deepEqual([told.left.data, told.left.half.includes('data.db.fetch')], [false, true])
  // Started again, it found no half file to go on from: it fetched the shared file and every file anew.
  assert.equal(asked.data, 2)
  assert.equal(asked.files, asked.heldBack + teams.length)
  assert.deepEqual([told.half, told.temporary], [[], []])
  assert.deepEqual([told.role, told.n], ['reader', writer.at().n])
  assert.deepEqual(teamFilesIn(readerFolder), teamFilesIn(dataFolder))
  for (const team of teams) assert.deepEqual(told.orders[team], await titlesOf(writer, team), team)
})
