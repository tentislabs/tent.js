import { test } from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { servedLive } from './living.ts'
import { sessionIn } from './sessionIn.ts'

const system = { kind: 'system' } as const

test('[27-16] the starter of a run of a flow that is offered stops it with stop of useRun, which calls the flow with the run and stop', async (t) => {
  const at = await servedLive(t, { project: 'runStopped' })
  const row = await at.app.call('addUser', { name: 'Maya', roles: [] }, { as: system })
  const user = String(Reflect.get(Object(row), 'id'))
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, at.origin, at.app.session(user))
    await page.goto(`${at.origin}/wait`)
    await page.getByText('Start', { exact: true }).click()
    await page.getByText('Said {"waits":true}').waitFor()
    await page.getByText('Stop', { exact: true }).and(page.locator(':not([disabled])')).click()
    await page.getByText('State stopped').waitFor()
  })
})
