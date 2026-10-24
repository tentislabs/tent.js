import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { copyOf, heldToProjects } from './copies.ts'

// The rules of a data file for each tenant, each by the name of its file in the list.
const cases = ['T2013/column', 'T2013/links', 'T2013/sorts', 'T2013/writes']
const rules = [...cases, 'T2014']

/** The definitions that a code was found at, each once, in the order of their names. */
const foundAt = (findings: Finding[], code: string): string[] =>
  [...new Set(findings.filter((one) => one.code === code).map((one) => one.where?.definition ?? ''))].sort()

/** Checks a copy of one project of a rule, and answers what was found with the folder of the copy. */
async function checked(name: string, side: 'pass' | 'fail'): Promise<{ findings: Finding[]; folder: string }> {
  const folder = copyOf(join(name, side), `${name.replace('/', '-')}-${side}`)
  return { findings: (await checkRules(folder)).findings, folder }
}

/** The finding of a code at one definition. Fails where there is none. */
function findingAt(findings: Finding[], code: string, definition: string): Finding {
  const found = findings.find((one) => one.code === code && one.where?.definition === definition)
  assert.ok(found, `${code} is found at ${definition}`)
  return found
}

test('[15-1@4] each case of T2013 and the rule T2014 has a passing project and a failing project, and the failing one gives exactly its code', async () => {
  for (const name of rules) {
    const code = name.split('/')[0]
    const { findings, folder } = await heldToProjects(name)
    for (const one of findings) {
      const file = one.where?.file ?? ''
      assert.match(file, /\.ts$/, one.code)
      const lines = readFileSync(join(folder, file), 'utf8').split('\n').length
      assert.ok((one.where?.line ?? 0) > 0 && (one.where?.line ?? 0) <= lines, `${one.code} names a line of ${file}`)
      assert.ok(one.message.length > 10 && one.fix, one.code)
      assert.equal(one.docs, `tent docs ${one.code}`)
      // T2014 is a note: the app runs, and whoever wrote the rule may have meant it.
      assert.equal(one.level, code === 'T2014' ? 'note' : 'error', one.code)
    }
  }
})

test('[50-2@4] the check reports each case of T2013', async () => {
  // A `tenant` that names no required link to a table of the shared file, and one whose rows do not go with their tenant.
  const column = (await checked('T2013/column', 'fail')).findings
  assert.deepEqual(foundAt(column, 'T2013'), ['drafts', 'lines', 'notes', 'orders', 'tasks'])
  assert.match(findingAt(column, 'T2013', 'notes').message, /`notes\.team`.* no link/)
  assert.match(findingAt(column, 'T2013', 'tasks').message, /`tenant` names `team`.* no column/)
  assert.match(findingAt(column, 'T2013', 'drafts').message, /`drafts\.team`.* may hold nothing/)
  assert.match(findingAt(column, 'T2013', 'orders').message, /`orders\.team`.*`onRemove: 'remove'`/)
  assert.match(findingAt(column, 'T2013', 'lines').message, /`orders`.* a tenant table itself/)

  // A link into a tenant's file from outside it, and one between tenant tables whose tenants are of two different tables.
  const links = (await checked('T2013/links', 'fail')).findings
  assert.deepEqual(foundAt(links, 'T2013'), ['orders', 'stars', 'stock'])
  assert.match(findingAt(links, 'T2013', 'stars').message, /`stars\.order` links into the data file of a tenant/)
  assert.match(findingAt(links, 'T2013', 'stock').message, /`stock\.order`.*`shops`.*`teams`/)

  // A change written with `set` that writes two files, by the value that each `of` holds.
  const writes = (await checked('T2013/writes', 'fail')).findings
  assert.deepEqual(foundAt(writes, 'T2013'), ['addLogged', 'copyOrder'])
  assert.match(findingAt(writes, 'T2013', 'copyOrder').message, /two (data )?files/)
  assert.match(findingAt(writes, 'T2013', 'addLogged').message, /`log`.*shared file/)

  // A sort and a group through a link from a tenant's file into the shared file, written as a value and in code.
  const sorts = (await checked('T2013/sorts', 'fail')).findings
  assert.deepEqual(foundAt(sorts, 'T2013'), ['byName', 'inCode', 'perName'])
  assert.match(findingAt(sorts, 'T2013', 'byName').message, /sort.*`placedBy\.name`/)
  assert.match(findingAt(sorts, 'T2013', 'perName').message, /group.*`placedBy\.name`/)

  // A chain on a tenant table that does not begin with `of`: found where the project is described, and passed on.
  const folder = copyOf(join('T2013/column', 'pass'), 'T2013-no-of')
  appendFileSync(
    join(folder, 'functions', 'desk.ts'),
    "\nimport { query } from 'tentjs'\n\nexport const everyOrder = query('everyOrder', { access: 'signedIn', rows: orders.limit(3) })\n",
  )
  const noOf = (await checkRules(folder)).findings
  assert.deepEqual(foundAt(noOf, 'T2013'), ['everyOrder'])
  assert.match(findingAt(noOf, 'T2013', 'everyOrder').message, /does not begin with `of`/)
  assert.deepEqual([...new Set(noOf.map((one) => one.code))], ['T2013'])
})

test('[50-3@4] a tenant table whose read rule does not name its tenant column is noted with T2014', async () => {
  const { findings } = await checked('T2014', 'fail')
  assert.deepEqual(foundAt(findings, 'T2014'), ['notes', 'orders'])
  for (const one of findings) assert.equal(one.level, 'note')
  assert.match(findingAt(findings, 'T2014', 'orders').message, /`orders`.*`team`.*every tenant/)
  // A rule that names the column, and one that reads a tenant table whose tenants are of the same table, is no note.
  assert.deepEqual((await checked('T2014', 'pass')).findings, [])
})

test('[50-4@4] a link with refuse from a tenant table into the shared file is T2013', async () => {
  const { findings } = await checked('T2013/links', 'fail')
  const found = findingAt(findings, 'T2013', 'orders')
  assert.match(found.message, /`orders\.placedBy`.*refuse/)
  assert.match(found.fix ?? '', /'remove'.*'clear'/)
  // The same link with `onRemove: 'clear'` is as the documents ask.
  assert.deepEqual(foundAt((await checked('T2013/links', 'pass')).findings, 'T2013'), [])
})
