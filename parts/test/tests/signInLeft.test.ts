import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, served } from './served.ts'

// A screen that anyone sees, with a link to a screen that needs a sign-in.
const open = `
export const openScreen = screen('openScreen', {
  path: '/open',
  access: 'anyone',
  view: () => <Link to="/driven?tab=paid">To the papers</Link>,
})
`

test('[31-10] with no screen at the sign-in path, a move inside a page to a screen that needs a sign-in answers leave with the address, and the browser loads it whole and is shown the page of the engine for a sign-in that is needed', async () => {
  const { address } = await served('papered', {
    change: (folder) => {
      const screens = join(folder, 'screens.tsx')
      writeFileSync(screens, readFileSync(screens, 'utf8').replace('useField }', 'useField, Link }'))
      appendFileSync(screens, open)
    },
  })
  const version = String(Object(await (await fetch(`${address}/_t/health`)).json()).value.version)
  const asked = new URLSearchParams({ path: '/driven?tab=paid', version })
  const answer = await fetch(`${address}/_t/screen?${asked}`)
  assert.deepEqual(Object(await answer.json()).value, { leave: '/driven?tab=paid' })
  await inBrowser('chromium', async (page) => {
    await alive(page, `${address}/open`)
    const loaded = page.waitForResponse((one) => new URL(one.url()).pathname === '/driven')
    await page.getByRole('link', { name: 'To the papers' }).click()
    assert.equal((await loaded).status(), 401)
    await page.getByText('Sign in to see this page.').waitFor()
    assert.equal(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, '/driven?tab=paid')
  })
})
