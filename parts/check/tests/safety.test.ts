import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import type { Facts } from '../../core/internal.ts'
import { finding } from '../../core/internal.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf, heldToProjects, lineWith } from './copies.ts'

// The rules of the data and of the safety, each by the name of its file in the list.
const alone = ['T2005', 'T2006', 'T2007', 'T2008', 'T2009', 'T2010', 'T2011', 'T2012']
const safety = ['T3001', 'T3002', 'T3003', 'T3004/functions', 'T3005', 'T3006', 'T3009']
// The rules that pass on what the data found of a table change: they find nothing where no facts are handed in.
const passedOn = ['T2001', 'T2002', 'T2003', 'T2004']

/** Each finding as the definition it stands at and its code, in the order of the names. */
const found = (findings: Finding[]): string[] =>
  findings.map((one) => `${one.where?.definition ?? ''}:${one.code}`).sort()

/** Holds every finding to its level, its place, its sentence, its fix and its page. */
function whole(findings: Finding[], folder: string): void {
  for (const one of findings) {
    const file = one.where?.file ?? ''
    assert.match(file, /\.ts$/, one.code)
    const lines = readFileSync(join(folder, file), 'utf8').split('\n').length
    assert.ok((one.where?.line ?? 0) > 0 && (one.where?.line ?? 0) <= lines, `${one.code} names a line of ${file}`)
    assert.ok(one.message.length > 10 && one.fix, one.code)
    assert.equal(one.docs, `tent docs ${one.code}`)
    assert.equal(one.level, one.code === 'T3005' ? 'warning' : 'error', one.code)
  }
}

test('[15-1@4] every rule of the data and of the safety has a passing project and a failing project, and the failing one gives exactly its code', async () => {
  const names = list.map((one) => one.name)
  for (const name of [...passedOn, ...alone, ...safety]) assert.ok(names.includes(name), `the rule ${name} is built`)
  for (const name of [...alone, ...safety]) {
    const { findings, folder } = await heldToProjects(name)
    whole(findings, folder)
  }
})

// What the data says of each table change that it refuses, in its own words, as `factsOf` answers it.
const refused: Record<string, Finding> = {
  T2001: finding('T2001', '1 row of `notes` does not fit what `notes.n` becomes.', {
    fix: 'Change those rows so that they fit, or add a new column, fill it with a change, then remove the old one.',
  }),
  T2002: finding('T2002', 'The column `notes.n` is gone, and `removed` does not name it.', {
    fix: "Name `n` in `removed` of the table, or state `was: ['n']` on the column it became.",
  }),
  T2003: finding('T2003', 'The table `notes` is gone, and `removed` of the project does not name it.', {
    fix: "Name `notes` in `removed` of the project, or state `was: ['notes']` on the table it became.",
  }),
  T2004: finding('T2004', 'The column `notes.n` is gone and `count` is new, with no `was`.', {
    fix: "State `was: ['n']` on the column that is the same one under a new name, or name `n` in `removed` of the table.",
  }),
}

const facts = (...codes: string[]): Facts => ({
  tableFindings: codes.map((code) => refused[code]),
  waitingStepNames: {},
})

test('[15-1@4] a rule that passes T2001 to T2004 on finds nothing alone, and with the facts of a running app exactly its code, at the place of the table', async () => {
  for (const code of passedOn) {
    const passing = copyOf(join(code, 'pass'), `${code}-pass`)
    assert.deepEqual((await checkRules(passing)).findings, [], `the passing project of ${code}`)
    assert.deepEqual((await checkRules(passing, { facts: facts() })).findings, [], `${code}, against data it fits`)

    // The failing project is the same app after a table change that its data does not bear: alone it says nothing.
    const folder = copyOf(join(code, 'fail'), `${code}-fail`)
    assert.deepEqual((await checkRules(folder)).findings, [], `the failing project of ${code}, with no facts`)
    const failing = await checkRules(folder, { facts: facts(code) })
    assert.equal(failing.findings.length, 1, `the failing project of ${code}`)
    const [one] = failing.findings
    assert.deepEqual([one.code, one.message, one.fix], [code, refused[code].message, refused[code].fix])
    whole(failing.findings, folder)
    // A description keeps no file and no line: the rule adds the place of the table, found by its name, and for a
    // table that is gone the place of the project, where `removed` is stated.
    const gone = code === 'T2003'
    const file = gone ? 'tent.ts' : 'functions/notes.ts'
    const line = lineWith(readFileSync(join(folder, file), 'utf8'), gone ? "project('shop'" : "table('notes'")
    assert.deepEqual(one.where, { file, line, definition: gone ? 'shop' : 'notes' })
  }

  // Each rule passes on the findings of its own code, so four findings that are handed in are told once each.
  const folder = copyOf(join('T2002', 'fail'), 'T2002-all')
  const all = await checkRules(folder, { facts: facts(...passedOn) })
  assert.deepEqual(all.findings.map((one) => one.code).sort(), passedOn)
  // A finding that names a table which the source does not hold, and which is no table that is gone, keeps its words.
  const far = finding('T2001', '3 rows of `elsewhere` do not fit what `elsewhere.n` becomes.', {
    fix: 'Mend the rows.',
  })
  const told = await checkRules(folder, { facts: { tableFindings: [far], waitingStepNames: {} } })
  assert.deepEqual(
    told.findings.map((one) => [one.code, one.message, one.where?.file]),
    [['T2001', far.message, 'tent.ts']],
  )
})

test('[20-18b] each misuse of a vector column and of near, and both cases of a value of another model, is reported by the check', async () => {
  const folder = copyOf('vectors', 'vectors')
  const made = await checkRules(folder)
  assert.deepEqual(
    found(made.findings),
    [
      // T2008: a declared size that is not the column's, as an input, as a written list, and in a body.
      ...['wrongSize:T2008', 'wrongList:T2008', 'bodyWrongSize:T2008'],
      // T2009: `near` with neither `limit` nor `first()`, written with `rows` and in a body.
      ...['noLimit:T2009', 'bodyNoLimit:T2009'],
      // T2010: a vector column in a filter other than `empty`, in a sort, an index, `unique` and a group.
      ...['filtered:T2010', 'sorted:T2010', 'indexed:T2010', 'uniqued:T2010', 'grouped:T2010', 'bodyFiltered:T2010'],
      // T2010: `near` on a column that is no vector, joined with what it does not join with, inside `in`, and in the filter of a `where` rule.
      // Joined with `search` it is no finding: the two are read in one pass and joined by their ranks.
      ...['notVector:T2010', 'withSort:T2010', 'withCount:T2010', 'withSkip:T2010'],
      ...['bodySorted:T2010', 'insideIn:T2010', 'digests:T2010'],
      // A vector column in `search` is T2006, and one named as `owner` is T2007.
      ...['searched:T2006', 'owned:T2007'],
      // T2012: the value's own type states another model, searched with and written; and the `embed` of another model in a body.
      ...['otherModel:T2012', 'writeOther:T2012', 'bodyOtherModel:T2012', 'bodyWriteOther:T2012', 'embedOther:T2012'],
    ].sort(),
  )
  whole(made.findings, folder)
  const of = (name: string): Finding => {
    const one = made.findings.find((finding) => finding.where?.definition === name)
    assert.ok(one, name)
    return one
  }
  const text = readFileSync(join(folder, 'functions', 'search.ts'), 'utf8')
  assert.equal(of('wrongSize').where?.line, lineWith(text, "query('wrongSize'"))
  assert.match(of('wrongSize').message, /\b3\b.*\b4\b|\b4\b.*\b3\b/)
  assert.match(of('noLimit').fix ?? '', /limit/)
  assert.match(of('insideIn').message, /`in`/)
  assert.match(of('digests').message, /rule/)
  // Both models are named as what they are: the provider and the name, which is what two definitions share.
  for (const name of ['otherModel', 'embedOther', 'writeOther']) {
    assert.match(of(name).message, /openai\/text-embedding-3-small/, name)
    assert.match(of(name).message, /openai\/text-embedding-3-large/, name)
  }
})

test('[15-1@4] a sealed column in a filter, a sort, a group, an index, search or unique, or named by a from, is T2011 from the check', async () => {
  const folder = copyOf('sealed', 'sealed')
  const made = await checkRules(folder)
  assert.deepEqual(
    found(made.findings),
    [
      ...['indexed:T2011', 'uniqued:T2011', 'searched:T2011', 'worked:T2011', 'flagged:T2011', 'flagged:T2011'],
      ...['byKey:T2011', 'byEither:T2011', 'sortedByKey:T2011', 'groupedByKey:T2011'],
      ...['bodyByKey:T2011', 'bodySorted:T2011'],
    ].sort(),
  )
  whole(made.findings, folder)
  const fix = made.findings.find((one) => one.where?.definition === 'byKey')?.fix ?? ''
  assert.match(fix, /fingerprint/)
})

test('[15-1@4] the cases of each rule of the safety, and of a link, a search column and an owner, are each found, and what is as the documents ask is not', async () => {
  const folder = copyOf('safety', 'safety')
  const made = await checkRules(folder)
  assert.deepEqual(
    found(made.findings),
    [
      // A link of a column and of an input to a table that is not there, a search column that is a number, an
      // owner column that links another table, and the rule 'owner' with no owner.
      ...['tasks:T2005', 'byProject:T2005', 'stock:T2006', 'desks:T2007', 'papers:T2007'],
      // Bare 'anyone' on the add of a table, on a change and on an action.
      ...['guestbook:T3002', 'sign:T3002', 'ping:T3002'],
      // Bare 'anyone' on the read of a table with a personal column, and on a query that reads one.
      ...['people:T3003', 'phoneBook:T3003', 'phones:T3003', 'bodyPhones:T3003'],
      // Full access with no `system`: `db.system` in a body, `db.sql` in code, and a member of `roles`.
      ...['peek:T3004', 'raw:T3004', 'promote:T3004'],
      'forgotten:T3005',
      // A private column in `pick`, through a link too, in a group, in a value a group works out, and in an output.
      ...['pay:T3006', 'paidBy:T3006', 'payGroups:T3006', 'payroll:T3006', 'payOut:T3006'],
      // `system` on a function that any signed-in caller, or anyone, may call, and a write of a table of owners.
      ...['markPaid:T3009', 'dropOrder:T3009', 'payAny:T3009'],
    ].sort(),
  )
  whole(made.findings, folder)
  const of = (name: string): Finding => {
    const one = made.findings.find((finding) => finding.where?.definition === name)
    assert.ok(one, name)
    return one
  }
  // The finding of the document: the rule of the table, the kind of write, and the two ways out.
  assert.match(of('markPaid').message, /"change" on orders is 'owner'/)
  assert.match(of('markPaid').fix ?? '', /remove `system`, or keep it and add a check that the caller owns/i)
  assert.match(of('tasks').message, /projects/)
  assert.match(of('raw').message, /db\.sql/)
  assert.match(of('peek').message, /db\.system/)
  assert.match(of('promote').message, /roles\.add/)
  const text = readFileSync(join(folder, 'functions', 'office.ts'), 'utf8')
  assert.equal(of('raw').where?.line, lineWith(text, "await db.sql('SELECT 1')"))
})

test('[15-1@4] a flow and an agent that name a door in `offer` and state no `access` are T3001, each at its own line, and a function with none is not', async () => {
  const folder = copyOf(join('T3001', 'fail'), 'T3001-each')
  const made = await checkRules(folder)
  assert.deepEqual(found(made.findings), ['helper:T3001', 'tidy:T3001'])
  const text = readFileSync(join(folder, 'flows', 'tidy.ts'), 'utf8')
  const lines = made.findings.map((one) => [one.where?.definition, one.where?.file, one.where?.line]).sort()
  assert.deepEqual(lines, [
    ['helper', 'flows/tidy.ts', lineWith(text, "agent('helper'")],
    ['tidy', 'flows/tidy.ts', lineWith(text, "flow('tidy'")],
  ])
  assert.match(made.findings.find((one) => one.where?.definition === 'tidy')?.message ?? '', /api/)
  assert.match(made.findings.find((one) => one.where?.definition === 'helper')?.message ?? '', /mcp/)
  // A function states `access` as a required option: one with none is told by the description, under its own code.
  const missing = await checkRules(copyOf(join('T1008', 'fail'), 'T1008-not-T3001'))
  assert.deepEqual([...new Set(missing.findings.map((one) => one.code))], ['T1008'])
})
