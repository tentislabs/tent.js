// A program that is killed while it imports a file of visits, and started again until it ends. Each start opens
// the app and, until every record stands, imports the same file again, as a person types the same command again.
// It says how many visits there are and how many names, as one line of JSON: a record written twice stands twice.
// Run: node import.ts <the bundle> <data folder> <the file>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [bundle, dataFolder, file] = process.argv.slice(2)
const { createEngine } = await import('../../../engine/index.ts')

console.log('opening')
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const system = { as: { kind: 'system' } }
const records = readFileSync(file, 'utf8').trim().split('\n').length
if ((await app.read({ from: 'visits' }, system)).length < records) {
  const { port, token } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const asked = new Request(`http://127.0.0.1:${port}/_t/admin/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ args: { what: 'import', file, with: 'addVisit', map: ['Full name=name'] } }),
  })
  const answer = await (await app.request(asked)).json()
  if (answer.ok !== true) throw new Error(JSON.stringify(answer.error))
}
const rows = await app.read({ from: 'visits' }, system)
console.log(`told: ${JSON.stringify({ rows: rows.length, names: new Set(rows.map((row) => row.name)).size })}`)
await engine.close()
process.exit(0)
