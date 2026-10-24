import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { startWords } from './startWords.ts'
import { copied, shell, typed } from './typed.ts'

// Two tables of which one links to the other, as a shop keeps its customers and their orders.
const tables = `import { link, number, table, text } from 'tentjs'

export const customers = table('customers', {
  columns: { name: text() },
  access: { read: 'signedIn' },
})

export const purchases = table('purchases', {
  columns: { customer: link('customers'), total: number() },
  access: { read: 'signedIn' },
})
`

// A seed that is an arrow, not async and with no await: it adds a row, and links a second row to the id it was answered.
const plain = `import { seed } from 'tentjs'

export default seed(({ db }) => {
  const ada = db.customers.add({ name: 'Ada Lovelace' })
  db.purchases.add({ customer: ada.id, total: 4250 })
})
`

// The same with what makes a seed code: names of the file's own, and a repeat with a number.
const coded = `import { seed } from 'tentjs'

const FIRST_DAY = Date.UTC(2025, 0, 1, 9, 0, 0)
const totals = [4250, 1999]

export default seed(({ db }) => {
  const ada = db.customers.add({ name: 'Ada Lovelace' })
  for (let n = 0; n < totals.length; n++) db.purchases.add({ customer: ada.id, total: (totals[n] ?? 0) + (FIRST_DAY > 0 ? 0 : 1) })
})
`

for (const [what, seed, totals] of [
  ['that is read as a plain body', plain, [4250]],
  ['that is code', coded, [4250, 1999]],
] as const)
  test(`[15-6@4] \`tent start --seed\` on an empty data folder applies a seed ${what}, an arrow that is not async and has no await: the row it adds is there, and so is the row that links to the id it was answered`, async (t) => {
    // The program that the test starts is ended before the folder of the test is removed: what ends a test is done
    // in the order it was said.
    const programs: (() => Promise<void>)[] = []
    t.after(async () => {
      for (const end of programs) await end()
    })
    const project = copied(t, `seed-links-${totals.length}`)
    writeFileSync(join(project, 'tables', 'customers.ts'), tables)
    writeFileSync(join(project, 'seed.ts'), seed)
    const built = await buildProject(project, { for: 'release' })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error'),
      [],
    )
    assert.equal(built.description.seed?.module !== undefined, totals.length === 2, 'the form of the seed')
    const data = join(project, '..', 'data')
    const words = startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--mode', 'test', '--seed'])
    const child = spawn(process.execPath, [shell, ...words], { cwd: project, stdio: ['ignore', 'ignore', 'pipe'] })
    const ended = new Promise<void>((done) => child.once('exit', () => done()))
    programs.push(async () => {
      child.kill()
      await ended
    })
    let said = ''
    child.stderr.setEncoding('utf8').on('data', (piece: string) => {
      said += piece
    })
    for (const ends = performance.now() + 60_000; performance.now() < ends; ) {
      if (/runs at http/.test(said) || child.exitCode !== null) break
      await new Promise((done) => setTimeout(done, 20))
    }
    assert.match(said, /shop runs at http/, said)
    // The rows are read through the engine that the command started.
    const rows = async (table: string): Promise<Record<string, unknown>[]> =>
      Object((await typed(project, 'data', 'rows', table, '--data', data, '--json')).answer.value)
    const customers = await rows('customers')
    const purchases = await rows('purchases')
    assert.deepEqual(
      customers.map((row) => row.name),
      ['Ada Lovelace'],
    )
    assert.deepEqual(
      purchases.map((row) => [row.customer, row.total]),
      totals.map((total) => [customers[0].id, total]),
    )
  })
