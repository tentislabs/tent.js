import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf } from './copies.ts'

test('[45-19.5] a list of links to a table kept in memory is T2027, as one link is', async () => {
  const folder = copyOf(join('T2027', 'fail'), 'T2027-list-of-links')
  const file = join(folder, 'tables', 'tables.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace("import { link, table, text } from 'tentjs'", "import { link, list, table, text } from 'tentjs'")
      .replace("seenBy: link('presence', { onRemove: 'clear', optional: true })", "seenBy: list(link('presence'))"),
  )
  const { findings } = await checkRules(folder)
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.definition]),
    [['T2027', 'notes']],
  )
})
