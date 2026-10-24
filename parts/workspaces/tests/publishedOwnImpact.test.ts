import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { folderOf, held, product } from './held.ts'

// A query that the workspace adds, open to every signed-in person: the impact of its publish holds wider rights.
const opened = `import { query } from 'tentjs'
import { notes } from '../tables/users'

export const everyNote = query('everyNote', { about: 'Every note', access: 'signedIn', rows: notes.oldest('body').limit(10) })
`

test("[44-2] a workspace whose change widens rights is published into the product's own engine with its impact, and refused where the person's word is no", async (t) => {
  const at = await product(t, folderOf(t))
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  // The owner is trusted with code: what a workspace of theirs holds is published into the product's own engine.
  const made = await held(t, { live, trusted: ['staff'] }, at)
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['staff'] } }], { as: 'system' }),
  )
  const workspace = await made.workspaces.create({ owner: String(Object(row).id), from: 'blank' })
  await made.workspaces.publish(workspace.id)
  writeFileSync(join(workspace.folder, 'project', 'functions', 'everyNote.ts'), opened)
  // The person said no: nothing is published, and the refusal names the impact.
  const refused = await made.workspaces.publish(workspace.id, { acceptImpact: false }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'impact'])
  // Left out, the word is no: a script cannot land wider rights unread.
  const unread = await made.workspaces.publish(workspace.id).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([unread?.code, unread?.fields?.reason], ['T9103', 'impact'])
  // With their word, it is published, and its answer holds its impact.
  const published = await made.workspaces.publish(workspace.id, { acceptImpact: true })
  assert.ok(
    published.impact?.rights.some((one) => one.name === 'everyNote'),
    JSON.stringify(published.impact),
  )
})
