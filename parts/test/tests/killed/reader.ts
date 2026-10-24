// A program that starts a reader on an empty data folder, says `fetching` once the shared file of its writer has
// arrived and the files of the tenants have not, and waits for its end. Started again after the kill, it says what
// the kill left in the folder, starts the reader once more, and says what it holds, as one line of JSON.
// Run: node reader.ts <address of the writer> <key> <data folder>
// The test stands between this program and its writer, and holds the files of the tenants back until the second
// start asks it at `/release` to let them pass.
import { existsSync, readdirSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'

const [from, key, dataFolder] = process.argv.slice(2)
const notes = join(dataFolder, '..', 'reader-started')
const second = existsSync(notes)
const { createEngine } = await import('../../../engine/index.ts')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const half = () => (existsSync(dataFolder) ? readdirSync(dataFolder).filter((name) => name.startsWith('data.db.fetch')) : [])
const temporary = () => {
  const folder = join(dataFolder, 'tenants', '.tmp')
  return existsSync(folder) ? readdirSync(folder) : []
}
const engine = createEngine({ port: 0 })
const options = { from, key, dataFolder, insecure: true }

if (!second) {
  writeFileSync(notes, '')
  let said = false
  setInterval(() => {
    if (said || !half().includes('data.db.fetch')) return
    said = true
    writeSync(1, 'fetching\n')
  }, 5)
  // The files of the tenants do not arrive: the reader fetches until this program is ended.
  await engine.read(options)
} else {
  const left = { data: existsSync(join(dataFolder, 'data.db')), half: half(), temporary: temporary().length > 0 }
  await fetch(`${from}/release`)
  const app = await engine.read(options)
  while (!app.at().current) await sleep(20)
  const teams = Object(await app.read({ from: 'teams', sort: [{ by: 'createdAt' }] }, { as: 'system' }))
  const orders = {}
  for (const team of teams) {
    const rows = await app.read({ from: 'orders', of: team.id, sort: [{ by: 'createdAt' }] }, { as: 'system' })
    orders[team.id] = rows.map((row) => row.title)
  }
  const told = { left, n: app.at().n, role: app.role, orders, half: half(), temporary: temporary() }
  await engine.close()
  writeSync(1, `told: ${JSON.stringify(told)}\n`)
  process.exit(0)
}
