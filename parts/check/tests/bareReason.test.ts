import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf } from './copies.ts'

const written = (reason: string): string => `import { anyone, change, input, table, text } from 'tentjs'

export const guests = table('guests', { columns: { name: text() }, access: { read: 'signedIn', add: 'signedIn' } })

export const sign = change('sign', {
  access: anyone(${JSON.stringify(reason)}),
  input: { name: text() },
  set: guests.add({ name: input('name') }),
})
`

test("[15-1@4] T3002: a reason of spaces alone is no reason, so a change that is open to anyone(' ') is found, and one with a reason in words is not", async () => {
  const found = async (reason: string, n: number): Promise<string[]> => {
    const folder = copyOf(join('T3009', 'pass'), `T3002-reason-${n}`)
    writeFileSync(join(folder, 'functions', 'notes.ts'), written(reason))
    return (await checkRules(folder)).findings.map((one) => `${one.code} ${one.where?.definition ?? ''}`)
  }
  assert.deepEqual(await found(' ', 0), ['T3002 sign'])
  assert.deepEqual(await found('the guest book is signed by whoever passes', 1), [])
})
