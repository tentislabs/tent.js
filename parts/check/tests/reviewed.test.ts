import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf } from './copies.ts'

// The tests of the reviewer of the step: each holds a project that a rule of the safety lets pass and that the row
// of the rule names, and fails until the rule finds it.

const head = `import { boolean, caller, change, input, link, list, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const orders = table('orders', {
  columns: { title: text(), placedBy: link('users'), paid: boolean({ default: false }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner' },
})
`

// Each is a change that anyone signed in may call, that states \`system\`, and that writes any row of a table whose
// rule is 'owner', with no check on the owner.
const open: Record<string, string> = {
  'it writes the owner column itself, and so hands any order to its caller': `
export const takeOrder = change('takeOrder', {
  access: 'signedIn',
  system: 'an order is handed to whoever asks for it',
  input: { order: link('orders') },
  set: orders.change(input('order'), { placedBy: caller('id') }),
})
`,
  'its code names the owner column in a comment alone': `
export const takeOrder = change('takeOrder', {
  access: 'signedIn',
  system: 'an order is marked paid when its payment arrives',
  input: { order: link('orders') },
  run: ({ db, input: given }) => {
    // placedBy is not looked at here.
    db.system.orders.change(given.order, { paid: true })
  },
})
`,
  'its code reaches db.system by another name': `
export const takeOrder = change('takeOrder', {
  access: 'signedIn',
  system: 'an order is marked paid when its payment arrives',
  input: { order: link('orders') },
  run: ({ db, input: given }) => {
    const all = db.system
    all.orders.change(given.order, { paid: true })
  },
})
`,
}

for (const [what, written] of Object.entries(open))
  test(`[15-1@4] T3009: a change that anyone signed in may call, that states system and writes a table whose rule is 'owner' with no check on the owner, is found where ${what}`, async () => {
    const folder = copyOf(join('T3009', 'pass'), `T3009-reviewed-${Object.keys(open).indexOf(what)}`)
    writeFileSync(join(folder, 'functions', 'notes.ts'), `${head}${written}`)
    const { findings } = await checkRules(folder)
    assert.deepEqual(
      findings.map((one) => `${one.code} ${one.where?.definition ?? ''}`),
      ['T3009 takeOrder'],
    )
  })
