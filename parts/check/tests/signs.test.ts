import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { codes } from '../../core/internal.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

test('[15-1@7a] T7015 has a passing project and a failing project, and the failing one gives exactly its code, as a note at the line of the call', async () => {
  const names = list.map((one) => one.name)
  assert.ok(names.includes('T7015'), 'the rule T7015 is built')
  const passing = await checkRules(copyOf(join('T7015', 'pass'), 'T7015-pass'))
  assert.deepEqual(passing.findings, [], 'the passing project of T7015')
  const folder = copyOf(join('T7015', 'fail'), 'T7015-fail')
  const failing = (await checkRules(folder)).findings
  assert.deepEqual(
    failing.map((one) => [one.code, one.level]),
    [['T7015', 'note']],
    'the failing project of T7015',
  )
  const [found] = failing
  // The note stands at the line of the call, says the fix, and names its page.
  const lines = readFileSync(join(folder, found.where?.file ?? ''), 'utf8').split('\n')
  assert.ok(lines[(found.where?.line ?? 0) - 1].includes('.reveal()'), `T7015 at line ${found.where?.line}`)
  assert.ok(found.fix && found.message.length > 10)
  assert.equal(found.docs, 'tent docs T7015')
  // A project states no sign-up: the check has no rule of one, and the registry no code.
  assert.deepEqual(
    names.filter((one) => one.startsWith('T3010')),
    [],
  )
  assert.equal(Object.hasOwn(codes, 'T3010'), false)
})

test('[15-1@7a] T7015 lists every use of reveal(), wherever it stands in a file of the project', async () => {
  const folder = copyOf(join('T7015', 'fail'), 'T7015-several')
  const file = join(folder, 'functions', 'signs.ts')
  const written = readFileSync(file, 'utf8')
  writeFileSync(
    file,
    `${written}
// A helper that is no definition opens a secret too.
const keyOf = (): string => secrets.PAY_KEY.reveal()

export const again = action('again', {
  access: anyone('a second look at a secret'),
  output: number(),
  run: async () => (keyOf() === secrets.OTHER.reveal() ? 1 : 0),
})
`,
  )
  const found = (await checkRules(folder)).findings.filter((one) => one.code === 'T7015')
  assert.equal(found.length, 3)
  assert.equal(new Set(found.map((one) => one.where?.line)).size, 3)
})
