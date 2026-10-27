// Joins the result files of the shares of one run, each a machine's own, into one result file for each system: a test
// stands as the worst state any share gave it, and the measures, the pictures and the flaky tests of every share are
// kept.
// Run: node scripts/shards.mjs <folder of the shares> <folder of results>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [from, into] = process.argv.slice(2)
if (!from || !into) throw new Error('Run: node scripts/shards.mjs <folder of the shares> <folder of results>')
const worst = ['passed', 'owed', 'failed']

/** Every result file under a folder, by its whole path. */
const found = (folder) =>
  readdirSync(folder, { recursive: true })
    .map(String)
    .filter((file) => /(^|[\\/])(linux|windows|macos)(\.night)?\.json$/.test(file))
    .map((file) => join(folder, file))

const joined = new Map()
for (const file of found(from)) {
  const one = JSON.parse(readFileSync(file, 'utf8'))
  const name = file.replace(/^.*[\\/]/, '')
  const held = joined.get(name) ?? { ...one, tests: {}, measures: {}, pictures: {} }
  for (const [id, state] of Object.entries(one.tests))
    if (held.tests[id] === undefined || worst.indexOf(state) > worst.indexOf(held.tests[id])) held.tests[id] = state
  Object.assign(held.measures, one.measures)
  Object.assign(held.pictures, one.pictures)
  if (one.flaky?.length) held.flaky = [...new Set([...(held.flaky ?? []), ...one.flaky])].sort()
  joined.set(name, held)
}
mkdirSync(into, { recursive: true })
for (const [name, result] of joined) {
  const tests = Object.fromEntries(Object.entries(result.tests).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(join(into, name), `${JSON.stringify({ ...result, tests }, null, 2)}\n`)
  console.log(`${name}: ${Object.keys(tests).length} ids from the shares`)
}
