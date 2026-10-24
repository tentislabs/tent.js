import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isInherited, own, ownMember } from '../internal.ts'

test('[12-2a] own, ownMember and isInherited: a member of its own is there, and a name that a thing only inherits from the runtime is not', () => {
  class Made {
    kept = 1
    nothing = undefined
    get worked(): number {
      return this.kept + 1
    }
    all(): number[] {
      return [this.kept]
    }
  }
  const made = new Made()
  const plain = { a: 1, none: undefined }
  const work = Object.assign(() => 1, { tool: 2 })
  const waiting = Object.assign(async () => 1, { tool: 2 })
  const bare: object = Object.assign(Object.create(null), { a: 1 })

  // A member that the thing holds, and one that whoever made it gave its kind, with the thing as what it is read on.
  assert.deepEqual(ownMember(plain, 'a'), { value: 1 })
  assert.deepEqual(ownMember(bare, 'a'), { value: 1 })
  assert.deepEqual(ownMember(made, 'kept'), { value: 1 })
  assert.deepEqual(ownMember(made, 'worked'), { value: 2 })
  assert.equal(typeof ownMember(made, 'all')?.value, 'function')
  assert.deepEqual(ownMember(work, 'tool'), { value: 2 })
  assert.deepEqual(ownMember([5, 6], '1'), { value: 6 })
  // A member whose value is nothing is told from no member.
  assert.deepEqual(ownMember(plain, 'none'), { value: undefined })
  assert.deepEqual(ownMember(made, 'nothing'), { value: undefined })
  assert.equal(ownMember(plain, 'gone'), undefined)
  assert.equal(own(plain, 'none'), undefined)

  // What the runtime gives its own kinds is not there: of a record, of a function of each kind, of a list.
  const inherited: [object, string][] = [
    [plain, 'toString'],
    [plain, 'hasOwnProperty'],
    [made, 'valueOf'],
    [work, 'call'],
    [work, 'apply'],
    [work, 'bind'],
    [waiting, 'call'],
    [function* () {}, 'bind'],
    [[1], 'map'],
    [[1], 'push'],
    [new Map(), 'get'],
    [new Date(0), 'getTime'],
    [Promise.resolve(1), 'then'],
  ]
  for (const [from, name] of inherited) {
    assert.equal(ownMember(from, name), undefined, name)
    assert.equal(own(from, name), undefined, name)
    assert.equal(isInherited(from, name), true, name)
  }
  // Every kind of the runtime, by a list of this test's own: a thing of the kind, and a name that the kind gives it
  // where it gives one that the thing does not hold itself.
  const kinds: [string, object, string | undefined][] = [
    ['a record', {}, 'toString'],
    ['a function', () => 1, 'call'],
    ['a function that waits', async () => 1, undefined],
    ['a generator function', function* () {}, undefined],
    ['a generator function that waits', async function* () {}, undefined],
    ['a list', [1], 'map'],
    ['a promise', Promise.resolve(1), 'then'],
    ['a map', new Map(), 'get'],
    ['a set', new Set(), 'has'],
    ['a date', new Date(0), 'getTime'],
    ['a regular expression', /a/, 'test'],
    ['an error', new Error('x'), 'toString'],
    ['a text', Object('a'), 'trim'],
    ['a number', Object(1), 'toFixed'],
    ['a flag', Object(true), 'valueOf'],
    ['a symbol', Object(Symbol('a')), 'description'],
    ['a large number', Object(1n), 'toLocaleString'],
  ]
  const kindOf = (thing: object): object => Object.getPrototypeOf(thing)
  assert.equal(new Set(kinds.map(([, thing]) => kindOf(thing))).size, 17)
  const notThere = (thing: object, name: string, what: string) => {
    assert.equal(ownMember(thing, name), undefined, `${what}: ${name}`)
    assert.equal(own(thing, name), undefined, `${what}: ${name}`)
    assert.equal(isInherited(thing, name), true, `${what}: ${name}`)
  }
  for (const [what, thing, name] of kinds) {
    if (name !== undefined) notThere(thing, name, what)
    // A member that stands on the kind itself, whoever put it there, is the kind's and not the thing's: three of
    // the kinds give no name of their own that a thing of them does not hold, so the test puts one there.
    Object.defineProperty(kindOf(thing), 'putOnTheKind', { value: 1, configurable: true })
    try {
      notThere(thing, 'putOnTheKind', what)
    } finally {
      Reflect.deleteProperty(kindOf(thing), 'putOnTheKind')
    }
  }
  // What made a thing is never there, whoever gave the name, also where the thing holds it itself.
  const holds: object = JSON.parse('{ "__proto__": 1, "constructor": 2 }')
  for (const from of [plain, made, work, bare, holds])
    for (const name of ['constructor', '__proto__']) {
      assert.equal(ownMember(from, name), undefined, name)
      assert.equal(own(from, name), undefined, name)
      assert.equal(isInherited(from, name), true, name)
    }
  // A name that is a member of its own, and one that the thing does not have at all, is not inherited.
  for (const [from, name] of [
    [plain, 'a'],
    [plain, 'none'],
    [plain, 'gone'],
    [made, 'all'],
    [work, 'tool'],
    [work, 'gone'],
  ] as const)
    assert.equal(isInherited(from, name), false, name)
  // `own` answers the value of the member, and nothing for what holds no members.
  assert.deepEqual([own(plain, 'a'), own(made, 'worked'), own(work, 'tool')], [1, 2, 2])
  assert.deepEqual(
    [own(undefined, 'a'), own(null, 'a'), own('text', 'length'), own(5, 'toFixed')],
    [undefined, undefined, undefined, undefined],
  )
})
