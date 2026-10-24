import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { history, saved } from './historyDev.ts'
import { edit, textIn } from './merging.ts'
import { copied, typed } from './typed.ts'

const functions = 'functions/orders.ts'

test('[40-4] tent history branch makes and lists branches, --switch goes to one that exists, and merge asks before it merges', async (t) => {
  // Through `tent dev`, whose points keep their descriptions: so the merge tells its changes in the terms of the app.
  let dev: Dev | undefined
  t.after(() => dev?.close())
  const project = copied(t, 'history-branch', 'merging')
  dev = await startDev(project, { port: 0, out: () => undefined })
  const made = await history(project, 'branch', 'side')
  assert.equal(made.branch, 'side')
  const listed = Object(await history(project, 'branch'))
  assert.equal(listed.on, 'main')
  assert.deepEqual(Object.keys(listed.branches).sort(), ['main', 'side'])
  assert.equal(listed.branches.main, listed.branches.side)

  const onSide = await history(project, 'branch', 'side', '--switch')
  assert.equal(onSide.on, 'side')
  await saved(dev, functions, ".limit(input('limit'))", '.limit(50)')
  const onMain = await history(project, 'branch', 'main', '--switch')
  assert.equal(onMain.on, 'main')
  assert.ok(textIn(project, functions).includes(".limit(input('limit'))"), 'the files of main are written back')
  await saved(
    dev,
    functions,
    'input: { title: text({ min: 1 }), total: number() }',
    'input: { title: text({ min: 2 }), total: number() }',
  )

  const before = textIn(project, functions)
  const asked = Object(await history(project, 'merge', 'side'))
  assert.equal(asked.merged, false)
  assert.ok(
    asked.lines.some((line: string) => line.startsWith('query openOrders:')),
    `the changes of the merge are told: ${asked.lines}`,
  )
  assert.equal(textIn(project, functions), before, 'without --yes nothing is merged')

  const merged = Object(await history(project, 'merge', 'side', '--yes'))
  assert.equal(merged.merged, true)
  assert.equal(merged.point.kind, 'merge')
  assert.equal(merged.checked, true, 'the merged files are built and checked, and the point marked so')
  const text = textIn(project, functions)
  assert.ok(text.includes('.limit(50)') && text.includes('text({ min: 2 })'))
  const switchedToNew = await history(project, 'branch', 'fresh', '--switch')
  assert.equal(switchedToNew.on, 'fresh', '--switch makes the branch first where it is not there')
})

test('[40-4] tent history merge --settle with the clash file there is T9102, and settles once it is gone', async (t) => {
  const project = copied(t, 'history-settle', 'merging')
  await history(project, 'save', 'start')
  await history(project, 'branch', 'side', '--switch')
  edit(project, { 'notes.md': [['2. Orders are sent the same day.', '2. Orders are sent the next day.']] })
  await history(project, 'branch', 'main', '--switch')
  edit(project, { 'notes.md': [['2. Orders are sent the same day.', '2. Orders are sent within the hour.']] })
  const merged = Object(await history(project, 'merge', 'side', '--yes'))
  assert.equal(merged.clashes.length, 1)
  assert.ok(existsSync(join(project, 'tent.clash.ts')))
  assert.equal(textIn(project, 'notes.md').includes('within the hour'), true, 'ours stays')

  const refused = await typed(project, 'history', 'merge', '--settle', '--json')
  assert.equal(refused.ended, 2, refused.printed)
  assert.equal(refused.answer.findings?.[0].code, 'T9102', refused.printed)

  rmSync(join(project, 'tent.clash.ts'))
  const settled = Object(await history(project, 'merge', '--settle'))
  assert.equal(settled.point.kind, 'merge')
  assert.equal(settled.checked, true)
  const pushed = await typed(project, 'history', 'merge', 'side', '--json')
  assert.equal(pushed.ended, 0, 'what was merged once is merged')
})
