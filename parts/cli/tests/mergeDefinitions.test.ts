import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ada, describedNow, textIn, twoSides } from './merging.ts'

const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'
const flows = 'flows/follow.ts'

// A value inside a text with values, as the files of the project write it.
const value = (name: string): string => ['$', '{', name, '}'].join('')
const noted = `await step('note line', () => \`- ${value('line')}\`)`

test('[40-4] a plain definition that both changed in other fields is merged and written in its place, and no other character of its file changes', async (t) => {
  const two = await twoSides(
    t,
    'merge-fields',
    { [functions]: [[".limit(input('limit'))", '.limit(50)']] },
    {
      [functions]: [
        ["  access: 'signedIn',\n  input: { limit: number() },", "  access: 'nobody',\n  input: { limit: number() },"],
      ],
    },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  const text = textIn(two.project, functions)
  const ours = two.texts.ours[functions]
  const start = ours.indexOf('export const openOrders')
  const end = ours.indexOf('\n})', start) + 3
  assert.equal(
    text.slice(0, start),
    ours.slice(0, start),
    'what stands before the definition, its comment among it, is as it was',
  )
  assert.equal(text.slice(text.length - (ours.length - end)), ours.slice(end), 'what stands after it is as it was')
  const description = await describedNow(two.project)
  const record = Object(description.functions.openOrders)
  assert.deepEqual(record.access, { rule: 'nobody' })
  assert.match(JSON.stringify(record), /"limit":50/)
  assert.equal(existsSync(join(two.project, 'tent.clash.ts')), false)
})

test('[40-4] a definition that only their side changed is taken as their text, so its comments and its layout stay', async (t) => {
  const theirs =
    "export const addOrder = change('addOrder', {\n  access: 'signedIn', // anyone signed in may order\n  input: { title: text({ min: 2 }), total: number() },"
  const two = await twoSides(
    t,
    'merge-theirs',
    { [functions]: [[".limit(input('limit'))", '.limit(50)']] },
    {
      [functions]: [
        [
          "export const addOrder = change('addOrder', {\n  access: 'signedIn',\n  input: { title: text({ min: 1 }), total: number() },",
          theirs,
        ],
      ],
    },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  const text = textIn(two.project, functions)
  assert.ok(text.includes(theirs), 'their text stands as they wrote it')
  assert.ok(text.includes('.limit(50)'), 'ours stands as we wrote it')
})

test('[40-4] two sides that changed one list with no names clash, and the clash file names the field and holds both definitions', async (t) => {
  const two = await twoSides(
    t,
    'merge-list',
    { [tables]: [["choice(['open', 'sent', 'done'])", "choice(['open', 'sent', 'done', 'lost'])"]] },
    { [tables]: [["choice(['open', 'sent', 'done'])", "choice(['new', 'sent', 'done'])"]] },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(merged.point?.unsettled, true)
  assert.deepEqual(
    merged.clashes.map((one) => [one.what, one.name, one.path]),
    [['table', 'orders', ['columns', 'state', 'values']]],
  )
  assert.equal(textIn(two.project, tables), two.texts.ours[tables], 'ours stays in its file')
  const clash = textIn(two.project, 'tent.clash.ts')
  assert.match(
    clash,
    /\/\/ 1\. table orders \(tables\/orders\.ts\): columns\.state\.values - ours \["open","sent","done","lost"\], theirs \["new","sent","done"\], before \["open","sent","done"\]/,
  )
  assert.match(clash, /export const orders__ours = table\('orders', \{/)
  assert.match(clash, /export const orders__theirs = table\('orders', \{/)
})

test('[40-4] a plain definition both changed whose text reads a name that no record holds clashes whole, and ours stays', async (t) => {
  const two = await twoSides(
    t,
    'merge-named',
    { [tables]: [['text({ min: 1, max: 80 })', 'text({ min: 1, max: 90 })']] },
    { [tables]: [['number({ min: 0 })', 'number({ min: 1 })']] },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(merged.point?.unsettled, true)
  assert.equal(textIn(two.project, tables), two.texts.ours[tables])
  assert.match(
    textIn(two.project, 'tent.clash.ts'),
    /\/\/ 1\. table orders \(tables\/orders\.ts\): both changed it, and ours reads NOTE_LENGTH on line \d+, which no record holds\nexport const orders__theirs = table\('orders'/,
  )
})

test('[40-4] two sides that each changed another step of one flow merge: a step in a repeat, and a step of onFail', async (t) => {
  const two = await twoSides(
    t,
    'merge-steps',
    { [flows]: [["await step('note line', () => line)", noted]] },
    {
      [flows]: [
        ["await step('tell owner', () => 'it failed')", "await step('tell owner', () => 'the follow up failed')"],
      ],
    },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  const text = textIn(two.project, flows)
  assert.ok(text.includes(noted))
  assert.ok(text.includes("await step('tell owner', () => 'the follow up failed')"))
  await describedNow(two.project)
})

test('[40-4] a step that one side moved and the other changed merges, and a step that each side added keeps both', async (t) => {
  const thank = "    await step('thank', () => 'thanks')\n"
  const two = await twoSides(
    t,
    'merge-moved',
    {
      [flows]: [
        [thank, ''],
        ["    const greeting = 'Hello'\n", `    const greeting = 'Hello'\n${thank}`],
        ["    return 'done'", "    await step('ours added', () => 'a')\n    return 'done'"],
      ],
    },
    {
      [flows]: [
        ["await step('thank', () => 'thanks')", "await step('thank', () => 'many thanks')"],
        [
          '  run: async ({ input, step }) => {\n',
          "  run: async ({ input, step }) => {\n    await step('theirs added', () => 'b')\n",
        ],
      ],
    },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  const text = textIn(two.project, flows)
  const at = (words: string): number => {
    const found = text.indexOf(words)
    assert.ok(found >= 0, `the merged flow holds ${words}`)
    return found
  }
  assert.ok(
    at("step('thank', () => 'many thanks')") < at('for (const line'),
    'the moved step stands where ours moved it, as theirs changed it',
  )
  assert.ok(at("step('theirs added'") < at("step('ours added'"))
  await describedNow(two.project)
})

test('[40-4] two sides that changed the same step clash, and so does a step that reads a const which the other side changed', async (t) => {
  const same = await twoSides(
    t,
    'merge-same-step',
    { [flows]: [["() => 'thanks'", "() => 'thank you'"]] },
    { [flows]: [["() => 'thanks'", "() => 'cheers'"]] },
  )
  const merged = same.history.merge(same.project, 'side', ada)
  assert.deepEqual(
    merged.clashes.map((one) => [one.what, one.name]),
    [['step', 'followUp.thank']],
  )
  assert.equal(textIn(same.project, flows), same.texts.ours[flows])
  const read = await twoSides(
    t,
    'merge-const',
    { [flows]: [["const greeting = 'Hello'", "const greeting = 'Hi'"]] },
    {
      [flows]: [
        [
          `() => \`${value('greeting')} ${value('input.title')}\``,
          `() => \`${value('greeting')}, ${value('input.title')}\``,
        ],
      ],
    },
  )
  const again = read.history.merge(read.project, 'side', ada)
  assert.deepEqual(
    again.clashes.map((one) => [one.what, one.name]),
    [['step', 'followUp.tell sales']],
  )
})

test('[40-4] a definition that one side removed and the other changed clashes whole, and the clash file holds theirs', async (t) => {
  const clients =
    "\nexport const clients = table('clients', {\n  columns: {\n    name: text(),\n    city: text({ optional: true }),\n  },\n  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'nobody' },\n})\n"
  const two = await twoSides(
    t,
    'merge-removed',
    { [tables]: [[clients, '']] },
    { [tables]: [['city: text({ optional: true })', 'city: text({ optional: true, max: 40 })']] },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(merged.point?.unsettled, true)
  assert.ok(!textIn(two.project, tables).includes('export const clients'))
  assert.match(
    textIn(two.project, 'tent.clash.ts'),
    /\/\/ 1\. table clients \(tables\/orders\.ts\): removed here, and changed there\nexport const clients__theirs = table\('clients'/,
  )
})

test('[40-4] a code definition merges line by line: other lines are both taken, and the same lines clash', async (t) => {
  const two = await twoSides(
    t,
    'merge-code',
    { [functions]: [['const second = first.toUpperCase()', 'const second = first.toLowerCase()']] },
    { [functions]: [["const fourth = third.padEnd(8, '-')", "const fourth = third.padEnd(10, '-')"]] },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  const text = textIn(two.project, functions)
  assert.ok(text.includes('const second = first.toLowerCase()'))
  assert.ok(text.includes("const fourth = third.padEnd(10, '-')"))
  const clashing = await twoSides(
    t,
    'merge-code-clash',
    { [functions]: [['const third = second.slice(0, 4)', 'const third = second.slice(0, 5)']] },
    { [functions]: [['const third = second.slice(0, 4)', 'const third = second.slice(1, 4)']] },
  )
  const apart = clashing.history.merge(clashing.project, 'side', ada)
  assert.deepEqual(
    apart.clashes.map((one) => [one.what, one.name]),
    [['action', 'refund']],
  )
  const clash = textIn(clashing.project, 'tent.clash.ts')
  assert.match(
    clash,
    /\/\/ 1\. action refund \(functions\/orders\.ts\): code, lines \d+ to \d+\n\/\* ours\n {2}\s*const third = second\.slice\(0, 5\)\ntheirs\n {2}\s*const third = second\.slice\(1, 4\)\n\*\//,
  )
  assert.equal(textIn(clashing.project, functions), clashing.texts.ours[functions])
})
