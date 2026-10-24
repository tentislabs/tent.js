import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import type { LiveServed } from './living.ts'
import { servedLive } from './living.ts'
import { sessionIn } from './sessionIn.ts'

const system = { kind: 'system' } as const

/** Adds a user, and answers the id of their row and a conversation of theirs. */
async function userWithChat(at: LiveServed): Promise<{ user: string; chat: string }> {
  const row = await at.app.call('addUser', { name: 'Maya', roles: [] }, { as: system })
  const user = String(Reflect.get(Object(row), 'id'))
  const as = { kind: 'user' as const, user: { id: user, roles: [] } }
  const chat = String(Reflect.get(Object(await at.app.call('newChat', {}, { as })), 'id'))
  return { user, chat }
}

test('[27-5] [27-6] from a screen: useAgent starts a run, shows the answer as it is written and each ask, approves it, and after a reload follows its run again', async (t) => {
  const at = await servedLive(t, { project: 'assisted' })
  const { user, chat } = await userWithChat(at)
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, at.origin, at.app.session(user))
    await page.goto(`${at.origin}/chat/${chat}`)
    await page.getByText('Say hello').click()
    await page.getByText('Answer: You said Hello there.').waitFor()
    await page.getByText('State done').waitFor()
    // After a reload the hook follows the latest run of the conversation again.
    await page.reload()
    await page.getByText('Answer: You said Hello there.').waitFor()
    await page.getByText('Ask for a refund').click()
    await page.getByText('Yes to refund').click()
    await page.getByText('Answer: refunded o1').waitFor()
    assert.equal(await page.getByText('Yes to refund').count(), 0)
  })
})

test('[27-5] from a screen with a Form: the run starts, and working shows its text and its end', async (t) => {
  const at = await servedLive(t, { project: 'assisted' })
  const { user } = await userWithChat(at)
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, at.origin, at.app.session(user))
    await page.goto(`${at.origin}/form`)
    await page.locator('textarea').first().fill('Hi')
    await page.getByText('Send', { exact: true }).click()
    await page.getByText('Working: done You said Hi').waitFor()
  })
})
