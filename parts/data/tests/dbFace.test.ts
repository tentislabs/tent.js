import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, table } from '../../core/index.ts'
import type { DbMembers, FaceOptions, FaceWrite } from '../index.ts'
import { dbFace } from '../index.ts'

/** What the three members of a test were handed, in order, and what each answers. */
interface Asked {
  reads: { plan: unknown; full: boolean }[]
  writes: { writes: FaceWrite[]; full: boolean }[]
  texts: { text: string; values: unknown[]; of?: string }[]
}

/** Three members that write down what they are handed and answer a row, or a promise of it where the face waits. */
function membersOf(asked: Asked, waits: boolean): DbMembers {
  const answer = (value: unknown): unknown => (waits ? Promise.resolve(value) : value)
  return {
    read(plan, full) {
      asked.reads.push({ plan, full })
      return answer([{ id: 'n1' }])
    },
    write(writes, full) {
      asked.writes.push({ writes, full })
      return answer(writes.map(() => ({ id: 'n1', what: 'made' })))
    },
    sql(text, values, o) {
      asked.texts.push({ text, values, ...o })
      return answer([{ _n: 7 }])
    },
  }
}

const plan = (made: object): unknown => Reflect.get(made, 'plan')
const fresh = (): Asked => ({ reads: [], writes: [], texts: [] })
const isPromise = (value: unknown): boolean => value instanceof Promise

/** Calls a member of the face by its way there, as code would. */
function call(db: unknown, way: string[], args: unknown[]): unknown {
  let at: unknown = db
  for (const name of way.slice(0, -1)) at = Reflect.get(Object(at), name)
  const member: unknown = Reflect.get(Object(at), String(way.at(-1)))
  assert.equal(typeof member, 'function', `the face has ${way.join('.')}`)
  return Reflect.apply(Object(member), at, args)
}

for (const mode of ['read', 'write', 'async'] as const)
  test(`[52-15] dbFace over three members makes, for each member of db, the plan, the writes or the text that createDb carries out, ${mode === 'async' ? 'as a promise in an action' : `at once in a ${mode === 'read' ? 'query' : 'change'}`}`, async () => {
    const asked = fresh()
    const o: FaceOptions = { tables: ['notes'], mode, full: true }
    const db = dbFace(membersOf(asked, mode === 'async'), o)
    const notes = table('notes', {})
    const answers: unknown[] = []
    const asks: [string[], unknown[]][] = [
      [['notes', 'all'], []],
      [['notes', 'first'], []],
      [['notes', 'count'], []],
      [['notes', 'get'], ['n1']],
      [['notes', 'count'], [{ what: 'a' }]],
      [['notes', 'history'], ['n1']],
      [['system', 'notes', 'all'], []],
    ]
    for (const [way, args] of asks) answers.push(call(db, way, args))
    const where = call(db, ['notes', 'where'], [{ what: 'a' }])
    const limited = call(where, ['newest'], ['createdAt'])
    answers.push(call(call(limited, ['limit'], [3]), ['all'], []))
    answers.push(call(call(db, ['notes', 'of'], ['t1']), ['get'], ['n1']))
    assert.deepEqual(asked.reads, [
      { plan: plan(notes), full: false },
      { plan: plan(notes.first()), full: false },
      { plan: plan(notes.count()), full: false },
      { plan: plan(notes.get('n1')), full: false },
      { plan: plan(notes.count({ what: 'a' })), full: false },
      { plan: plan(notes.history('n1')), full: false },
      { plan: plan(notes), full: true },
      { plan: plan(notes.where({ what: 'a' }).newest('createdAt').limit(3)), full: false },
      { plan: plan(notes.of('t1').get('n1')), full: false },
    ])
    // Every other member of a chain makes the plan that the same member of a plan of `core` makes.
    const chained: [string, unknown[]][] = [
      ['search', ['word']],
      ['group', ['what', { n: count() }]],
      ['with', ['owner']],
      ['near', ['meaning', [1, 0], { measure: 'cosine' }]],
      ['rank', ['ranker', 'words', { top: 5 }]],
      ['oldest', ['createdAt']],
      ['sort', ['what']],
      ['skip', [2]],
      ['after', ['cursor']],
      ['pick', [['what']]],
    ]
    for (const [member, args] of chained) {
      answers.push(call(call(db, ['notes', member], args), ['all'], []))
      const made: unknown = Reflect.apply(Object(Reflect.get(notes, member)), notes, args)
      assert.deepEqual(asked.reads.at(-1), { plan: plan(Object(made)), full: false }, member)
    }
    // A chain inside a filter is read as the plan it stands for.
    const others = call(db, ['notes', 'where'], [{ what: 'b' }])
    call(call(db, ['notes', 'where'], [{ id: { in: others } }]), ['all'], [])
    assert.deepEqual(asked.reads.at(-1)?.plan, plan(notes.where({ id: { in: notes.where({ what: 'b' }) } })))
    answers.push(call(db, ['notes', 'add'], [{ what: 'one' }]))
    answers.push(call(db, ['notes', 'change'], ['n1', { what: 'two' }]))
    answers.push(call(db, ['notes', 'remove'], ['n1']))
    answers.push(call(call(db, ['system', 'notes', 'of'], ['t1']), ['add'], [{ what: 'three' }]))
    assert.deepEqual(asked.writes, [
      { writes: [{ add: 'notes', values: { what: 'one' } }], full: false },
      { writes: [{ change: 'notes', id: 'n1', values: { what: 'two' } }], full: false },
      { writes: [{ remove: 'notes', id: 'n1' }], full: false },
      {
        writes: [{ add: 'notes', of: Reflect.get(Object(plan(notes.of('t1'))), 'of'), values: { what: 'three' } }],
        full: true,
      },
    ])
    answers.push(call(db, ['sql'], ['SELECT 1', [2], { of: 't1' }]))
    const n = call(db, ['n'], ['notes', 'n1'])
    answers.push(n)
    assert.deepEqual(asked.texts, [
      { text: 'SELECT 1', values: [2], of: 't1' },
      { text: 'SELECT "_n" FROM "notes" WHERE "id" = ?', values: ['n1'] },
    ])
    assert.deepEqual(
      answers.map(isPromise),
      answers.map(() => mode === 'async'),
      'every member answers at once, or a promise in an action',
    )
    assert.equal(await n, 7)
    assert.deepEqual(await answers[answers.length - 6], { id: 'n1', what: 'made' }, 'an add answers its row')
  })

test('[52-15] a face with no full access has neither `system` nor raw SQL', () => {
  const db = dbFace(membersOf(fresh(), false), { tables: ['notes'], mode: 'read', full: false })
  assert.deepEqual(
    ['system', 'sql', 'n'].map((name) => name in db),
    [false, false, false],
  )
})
