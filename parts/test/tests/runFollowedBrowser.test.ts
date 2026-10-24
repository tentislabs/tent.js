import { test } from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { servedLive } from './living.ts'
import { sessionIn } from './sessionIn.ts'

const system = { kind: 'system' } as const

test('[27-16] the starter of a run of a flow that states follow follows it with useRun: the page shows each value its step says, and the answer of the run at its end', async (t) => {
  const at = await servedLive(t, { project: 'runFollowed' })
  const row = await at.app.call('addUser', { name: 'Maya', roles: [] }, { as: system })
  const user = String(Reflect.get(Object(row), 'id'))
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, at.origin, at.app.session(user))
    await page.goto(`${at.origin}/count`)
    await page.getByText('Count', { exact: true }).click()
    await page.getByText('Said {"at":1}').waitFor()
    await page.getByText('Said {"at":3}').waitFor()
    await page.getByText('Answer 3').waitFor()
    await page.getByText('State done').waitFor()
  })
})
