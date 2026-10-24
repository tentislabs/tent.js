import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { servedLive } from './living.ts'

const system = { kind: 'system' } as const

test('[22-7] in a browser, after a call that started a session the page shows its screen as that user with no address loaded anew, and after the sign-out as a visitor', async (t) => {
  const at = await servedLive(t, { project: 'callers' })
  const users = Object(await at.app.read({ from: 'users' }, { as: system }))
  const maya = String(users.find((one: { email: string }) => one.email === 'maya@example.com').id)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await page.goto(`${at.origin}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByRole('heading', { name: 'A visitor', exact: true }).waitFor()
      // What a script of the page holds is lost when an address is loaded anew: the mark must outlive the sign-in.
      await page.evaluate('window.keptSinceTheFirstLoad = 1')
      await page.getByRole('textbox').fill('maya@example.com')
      await page.getByRole('button', { name: 'Sign in' }).click()
      // The screen is drawn again for the user, and what it reads through the door is the user's too.
      await page.getByRole('heading', { name: `Signed in as ${maya}`, exact: true }).waitFor()
      await page.getByText(`The door says ${maya}`, { exact: true }).waitFor()
      assert.equal(await page.evaluate('window.keptSinceTheFirstLoad'), 1, said)
      // The cookie of the session cannot be read by a script of the page.
      assert.equal(String(await page.evaluate('document.cookie')).includes('tent_session'), false, said)
      // The sign-out ends the session, and the same page is a visitor's again.
      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.getByRole('heading', { name: 'A visitor', exact: true }).waitFor()
      await page.getByText('The door says nobody', { exact: true }).waitFor()
      assert.equal(await page.evaluate('window.keptSinceTheFirstLoad'), 1, said)
    })
})
