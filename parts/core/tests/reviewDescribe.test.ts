import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  action,
  change,
  date,
  flow,
  get,
  importFile,
  input,
  later,
  list,
  backfill,
  now,
  project,
  secret,
  service,
  table,
  text,
} from '../index.ts'
import { checkDescription, describe } from '../internal.ts'

const shop = project('shop', {})
const orders = table('orders', { columns: { note: text({ optional: true }), at: date({ optional: true }) } })

/** Describes definitions that are held in memory. Answers the description and the codes of what was found, each with its words. */
function described(definitions: object[]) {
  const { description, findings } = describe({ definitions: definitions.map((value) => ({ value })) })
  return { description, found: findings.map((one) => `${one.code} ${one.message}`) }
}

test('[13-5] a length of time whose unit is a name that every object has does not read: T1011, in an option and in a value word', () => {
  // The words read as a number and a unit, and `constructor` is no unit of a length of time.
  const slow = flow('slow', { run: async () => undefined, limits: { time: '1 constructor' } })
  assert.ok(
    described([shop, slow]).found.some((one) => one.startsWith('T1011 slow:')),
    JSON.stringify(described([shop, slow]).found),
  )
  const stamp = change('stamp', {
    access: 'signedIn',
    set: orders.add({ at: later(now(), '2 constructors') }),
  })
  const { found } = described([shop, orders, stamp])
  assert.ok(
    found.some((one) => one.startsWith('T1011 stamp:')),
    JSON.stringify(found),
  )
})

test('[13-5] a default stays a literal, `now`, `today` or the caller: a reference to an input is a value that is not allowed, T1014', () => {
  const notes = table('notes', { columns: { by: text({ default: input('who') }) } })
  const { found } = described([shop, notes])
  assert.ok(
    found.some((one) => one.startsWith('T1014 notes:')),
    JSON.stringify(found),
  )
})

test('[13-5] a field of a service call that the table of a call cannot write where it is put is T1014 when the project is described', () => {
  // A list in the path, and a header that the auth of the service sets.
  const shopper = service('shopper', {
    url: 'https://api.example.com',
    calls: { item: get('/items/{ids}', { input: { ids: list(text()) } }) },
  })
  const signed = service('signed', {
    url: 'https://api.example.com',
    auth: { bearer: secret('KEY') },
    headers: { Authorization: 'Bearer x' },
  })
  const one = described([shop, shopper]).found
  assert.ok(
    one.some((finding) => finding.startsWith('T1014 shopper:')),
    JSON.stringify(one),
  )
  const two = described([shop, signed]).found
  assert.ok(
    two.some((finding) => finding.startsWith('T1014 signed:')),
    JSON.stringify(two),
  )
})

test('[11-1b] every word takes `was`, a backfill among them', () => {
  // The options stand apart, since the type of `backfill` takes no `was` either.
  const options = { table: orders, run: () => undefined, was: 'cut' }
  const split = backfill('split', options)
  const { found } = described([shop, orders, split])
  assert.deepEqual(
    found.filter((one) => one.startsWith('T1003')),
    [],
  )
})

test('[13-3] a description that holds a field the format does not list is refused, naming it, and `imports` of an action, which the format lists, is not', () => {
  const take = action('take', {
    access: 'signedIn',
    run: async () => importFile('file', { with: { definition: 'addOrder' } }),
  })
  const { description } = described([shop, take])
  assert.equal(description.functions.take.imports, true)
  /** The names of the fields refused in a copy of the description that holds one more field on the action. */
  const refused = (more: object): string[] => {
    const copy = structuredClone(description)
    Object.assign(copy.functions.take, more)
    return checkDescription(copy).flatMap((one) => Object.keys(one.fields ?? {}))
  }
  assert.deepEqual(refused({ imports: true }), refused({}))
  assert.ok(refused({ calls: true }).includes('functions.take.calls'), JSON.stringify(refused({ calls: true })))
})
