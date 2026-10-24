import assert from 'node:assert/strict'
import test from 'node:test'
import { addOrder, addTeam, deskBundle, deskOf, listed } from './desks.ts'
import { moment } from './many.ts'

test('[40-3b] app.facts with back turns a rename round in the files of tenants too, as the switch back does: the older files are no finding, and without back they are', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  for (const name of ['North', 'South']) await addOrder(app, await addTeam(app, name), `first of ${name}`)
  const older = structuredClone(app.description)
  await app.switch(await app.add(await deskBundle(t, { renamed: true })))
  for (let i = 0; i < 600; i++) {
    if ((await listed(app, dataFolder)).files.every((one) => !one.behind)) break
    await moment(25)
  }
  const plain = await app.facts(older)
  assert.ok(
    plain.tableFindings.some((one) => /^T200[2-4]$/.test(one.code)),
    JSON.stringify(plain.tableFindings),
  )
  assert.deepEqual((await app.facts(older, { back: true })).tableFindings, [])
})
