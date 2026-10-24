import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { nodePage, servedLive, cardTitlesOf } from './living.ts'

const system = { kind: 'system' } as const

test('[31-17] a call from a page whose version was dropped: the page follows the running version of a real engine, and the call is made once, with what the person typed', async (t) => {
  const at = await servedLive(t)
  // A page that holds no live connection hears of no switch: it learns of it at its next call.
  const page = await nodePage(at, '/quiet')
  const first = String(page.record.version)
  assert.equal(page.opened(), 0)

  // A second version, in which the screen changed, runs, and the first one can be loaded no more.
  const screens = join(at.projectFolder, 'screens.tsx')
  writeFileSync(screens, readFileSync(screens, 'utf8').replace('quiet cards', 'cards, quietly'))
  const next = await at.built()
  const second = await at.app.add(next.bundleFolder)
  await at.app.switch(second)
  assert.equal(await at.app.drop(first), true)
  const before = cardTitlesOf(await at.app.call('quietCards', {}, { as: system }))

  page.asked.length = 0
  await page.call('addCard', { title: 'What the person typed', rank: 700 })
  // The first try names the version that is gone. The page asks for its screen under the one that runs, and
  // sends the call once more: it loads its address anew at no point.
  const calls = page.asked.filter((one) => one.startsWith('POST /_t/call/addCard'))
  const again = page.asked.filter((one) => one.startsWith('GET /_t/screen?'))
  assert.deepEqual([calls.length, again], [2, [`GET /_t/screen?path=%2Fquiet&version=${second}`]])
  assert.deepEqual(page.gone, [])
  assert.equal(page.shows(), 'quietScreen')
  // The call was made once, with the input it was first sent with.
  const after = cardTitlesOf(await at.app.call('quietCards', {}, { as: system }))
  assert.deepEqual(
    after.filter((title) => !before.includes(title)),
    ['What the person typed'],
  )
  // From then on the page calls under the version that runs: nothing is asked for twice.
  page.asked.length = 0
  await page.call('addCard', { title: 'A second one', rank: 701 })
  assert.equal(page.asked.filter((one) => one.startsWith('POST /_t/call/addCard')).length, 1)
  assert.equal(page.asked.filter((one) => one.startsWith('GET /_t/screen?')).length, 0)
})
