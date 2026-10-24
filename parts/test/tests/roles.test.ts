import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'guarded') })
  closing(t, () => app.close())
  return app
}

async function idOf(app: TestApp, email: string): Promise<string> {
  return String((await app.rows('users')).find((one) => one.email === email)?.id)
}

const rolesOf = async (app: TestApp, id: string): Promise<unknown> =>
  (await app.rows('users')).find((one) => one.id === id)?.roles

test('[22-11] a user whose table rule lets them change their own row cannot change roles: a change that names the column is T3101, also with the value the row has, and the rest of the row is theirs to change', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  // The rule of the table lets the user change their own row.
  await app.as(maya).call('changeMine', { email: 'maya@shop.example' })
  assert.equal((await app.rows('users')).find((one) => one.id === maya)?.email, 'maya@shop.example')
  // A write of `roles` through a `db` that is limited to its caller is refused, whatever the rule of the table.
  await assert.rejects(app.as(maya).call('changeMine', { roles: ['admin'] }), { code: 'T3101' })
  await assert.rejects(app.as(maya).call('changeMine', { email: 'm@shop.example', roles: ['admin'] }), {
    code: 'T3101',
  })
  // Also where it names the value that the row has.
  await assert.rejects(app.as(maya).call('changeMine', { roles: [] }), { code: 'T3101' })
  assert.deepEqual(await rolesOf(app, maya), [])
  assert.equal((await app.rows('users')).find((one) => one.id === maya)?.email, 'maya@shop.example')
  // A program that writes for a user is held the same way, and the system writes freely.
  const asMaya: Caller = { kind: 'user', user: { id: maya, roles: [] } }
  await assert.rejects(app.write([{ change: 'users', id: maya, values: { roles: ['admin'] } }], { as: asMaya }), {
    code: 'T3101',
  })
  // An add that gives a role is refused, and one that gives none passes: the row starts with no role.
  await assert.rejects(
    app.write([{ add: 'users', values: { email: 'eve@example.com', roles: ['admin'] } }], { as: 'nobody' }),
    { code: 'T3101' },
  )
  await app.write([{ add: 'users', values: { email: 'new@example.com' } }], { as: 'nobody' })
  assert.deepEqual(await rolesOf(app, await idOf(app, 'new@example.com')), [])
  // The handle is full access: a function that states no `system` may not use it on the caller's own row either.
  await assert.rejects(app.as(maya).call('promoteMyself', { role: 'admin' }), { code: 'T0013' })
  assert.deepEqual(await rolesOf(app, maya), [])
})

test('[22-11] roles.add in a function that states system gives the role, and the next request of the user has it; remove and set write the list, and a user that is not there is T2103', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const root = await idOf(app, 'root@example.com')
  // The user holds a session before the role is given: the very next request of that session has the role.
  const browser = app.browser({ as: maya })
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: [maya] })
  const refused = await browser.call('staffOnly')
  assert.deepEqual([refused.ok, refused.error?.code], [false, 'T3101'])

  await app.as(root).call('promote', { user: maya, role: 'staff' })
  assert.deepEqual(await rolesOf(app, maya), ['staff'])
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: [maya, 'staff'] })
  assert.deepEqual(await browser.call('staffOnly'), { ok: true, value: 'for the staff' })

  // A role that the user has is not given twice, and one more is added at the end.
  await app.as(root).call('promote', { user: maya, role: 'staff' })
  await app.as(root).call('promote', { user: maya, role: 'editor' })
  assert.deepEqual(await rolesOf(app, maya), ['staff', 'editor'])
  // `remove` takes one role away, in an action as in a change, and one that the user lacks changes nothing.
  await app.as(root).call('demote', { user: maya, role: 'staff' })
  await app.as(root).call('demote', { user: maya, role: 'never-had' })
  assert.deepEqual(await rolesOf(app, maya), ['editor'])
  const lost = await browser.call('staffOnly')
  assert.deepEqual([lost.ok, lost.error?.code], [false, 'T3101'])
  // `set` writes the whole list, each role once.
  await app.as(root).call('giveRoles', { user: maya, roles: ['staff', 'staff', 'admin'] })
  assert.deepEqual(await rolesOf(app, maya), ['staff', 'admin'])
  await app.as(root).call('giveRoles', { user: maya, roles: [] })
  assert.deepEqual(await rolesOf(app, maya), [])

  // The handle names a row that is there.
  await assert.rejects(app.as(root).call('promote', { user: 'no-row-has-this-id', role: 'staff' }), {
    code: 'T2103',
  })
  // A caller that the rule of the function keeps out gives nobody a role.
  await assert.rejects(app.as(maya).call('promote', { user: maya, role: 'admin' }), { code: 'T3101' })
  assert.deepEqual(await rolesOf(app, maya), [])
})
