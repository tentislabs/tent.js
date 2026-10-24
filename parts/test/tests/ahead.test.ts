import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { openedAlive } from './browsing.ts'
import { served } from './served.ts'

/** Holds back the engine's answer of the next call of a function, until the test lets it go. */
async function heldBack(page: Page, name: string): Promise<() => void> {
  let release = (): void => undefined
  const gate = new Promise<void>((done) => {
    release = done
  })
  await page.route(
    `**/_t/call/${name}`,
    async (route) => {
      await gate
      await route.continue()
    },
    { times: 1 },
  )
  return release
}

/** The titles of the inbox as the page shows them, in their order. */
const inboxOf = (page: Page): Promise<string[]> => page.locator('[id="inbox"] [id="title"]').allTextContents()

/** The titles of the rows the page shows as optimistic results. */
const optimisticOf = (page: Page): Promise<string[]> =>
  page.locator('[id="row"][data-optimistic] [id="title"]').allTextContents()

test('[44-8] a plain change is shown before the engine answers: an add in its sorted place in the list it fits and as optimistic, a set and a remove at once, the real row in its place with no second drawing, a refusal taken back; a count, an action, and guess: false show nothing ahead; the guess of a code call shows what it answers', async () => {
  for (const engine of browserEngines) {
    // Each browser starts from the same rows.
    const at = await served('optimistic', { for: 'dev' })
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${at.address}/todos`)
      await page.getByRole('heading', { name: /in the inbox/ }).waitFor()
      const counted = await page.getByRole('heading', { name: /in the inbox/ }).textContent()
      const before = await inboxOf(page)
      const later = await page.locator('[id="later"]').textContent()

      // An add stands at once in the list whose filter it fits, in its sorted place, as optimistic.
      let release = await heldBack(page, 'addTodo')
      await page.getByRole('button', { name: 'Add bananas' }).click()
      await page.getByText('Bananas', { exact: true }).waitFor()
      const shown = await inboxOf(page)
      assert.deepEqual(shown, [...before, 'Bananas'].toSorted(), said)
      assert.deepEqual(await optimisticOf(page), ['Bananas'], said)
      // A list it does not fit, and a count, are not shown ahead.
      assert.equal(await page.locator('[id="later"]').textContent(), later, said)
      assert.equal(await page.getByRole('heading', { name: /in the inbox/ }).textContent(), counted, said)
      // The rows are marked, so that a second drawing of the list would show as new elements.
      await page.locator('[id="row"]').evaluateAll((rows) => {
        for (const row of rows) row.setAttribute('data-kept', 'yes')
      })
      release()
      await page.waitForFunction(() => document.querySelectorAll('[data-optimistic]').length === 0)
      await page.getByRole('heading', { name: `${before.length + 1} in the inbox` }).waitFor()
      assert.deepEqual(await inboxOf(page), shown, said)
      // The view keys its rows by their ids: the real row is drawn in the place of the optimistic one, and no other row
      // is drawn again.
      assert.equal(
        await page.locator('[id="row"]:not([data-kept])').count(),
        1,
        `the real row took the place of the optimistic one ${said}`,
      )

      // A set and a remove show at once.
      release = await heldBack(page, 'finish')
      await page.getByRole('button', { name: 'Finish Apples' }).click()
      await page.getByText('Apples (done)').waitFor({ timeout: 2000 })
      release()
      release = await heldBack(page, 'drop')
      await page.getByRole('button', { name: 'Drop Cherries' }).click()
      await page.getByText('Cherries', { exact: true }).waitFor({ state: 'detached', timeout: 2000 })
      release()
      await page.getByRole('heading', { name: `${before.length} in the inbox` }).waitFor()

      // A call the engine refuses takes back what was shown, and draws the failure.
      release = await heldBack(page, 'staffAdd')
      await page.getByRole('button', { name: 'Add dates as staff' }).click()
      await page.getByText('Dates', { exact: true }).waitFor({ timeout: 2000 })
      release()
      await page.getByRole('button', { name: /^Refused T/ }).waitFor()
      assert.equal(await page.getByText('Dates', { exact: true }).count(), 0, said)

      // An action shows nothing ahead.
      release = await heldBack(page, 'addLater')
      await page.getByRole('button', { name: 'Add figs by an action' }).click()
      await page.waitForTimeout(700)
      assert.equal(await page.getByText('Figs', { exact: true }).count(), 0, said)
      release()
      await page.getByText('Figs', { exact: true }).waitFor()

      // In a view, `optimistic: false` shows nothing ahead, and `optimistic` shows what it answers.
      await openedAlive(page, `${at.address}/code`)
      await page.getByRole('heading', { name: / shown$/ }).waitFor()
      release = await heldBack(page, 'addTodo')
      void page.evaluate(() => Reflect.get(window, 'quietAdd')({ title: 'Grapes', box: 'inbox' }))
      await page.waitForTimeout(700)
      assert.equal(await page.getByText('Grapes', { exact: true }).count(), 0, said)
      release()
      await page.getByText('Grapes', { exact: true }).waitFor()
      release = await heldBack(page, 'addTodo')
      void page.evaluate(() => Reflect.get(window, 'optimisticAdd')({ title: 'Kiwis', box: 'inbox' }))
      await page.getByText('Kiwis!', { exact: true }).waitFor({ timeout: 2000 })
      release()
      await page.getByText('Kiwis', { exact: true }).waitFor()
    })
  }
})
