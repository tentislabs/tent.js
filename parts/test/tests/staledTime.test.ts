import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { untilWithin } from './remotes.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** Every `page.stale` that the flow of the project was handed, in the order it was handed them. */
function toldOf(at: Served): { addresses?: { address: string }[]; why: string }[] {
  const data = new DatabaseSync(join(at.dataFolder, 'data.db'), { readOnly: true })
  try {
    return data
      .prepare('SELECT told FROM "staleNotes" ORDER BY rowid')
      .all()
      .map((row) => JSON.parse(String(row.told)))
  } catch {
    return []
  } finally {
    data.close()
  }
}

test("[44-4] a public answer whose time is up raises page.stale with its address and why: 'time'", async () => {
  const at = await served('staled', {
    change: (folder) => {
      const file = join(folder, 'screens.tsx')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(
          "cache: { for: '1 minute', public: true }",
          "cache: { for: '1 second', public: true }",
        ),
      )
    },
  })
  const first = await fetch(`${at.address}/shared`)
  assert.match(String(first.headers.get('cache-control')), /^public/)
  await first.text()
  // No write and no switch: only the time of the answer runs out.
  await untilWithin('the flow is handed the stale address', () => toldOf(at).some((one) => one.why === 'time'), 10_000)
  const stale = toldOf(at).find((one) => one.why === 'time')
  assert.deepEqual(
    stale?.addresses?.map((one) => one.address),
    ['/shared'],
  )
})
