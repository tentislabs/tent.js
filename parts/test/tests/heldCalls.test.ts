import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { openedAlive } from './browsing.ts'
import { served } from './served.ts'

const system = { kind: 'system' } as const

/** Waits until what is asked holds, and fails the test once the time is up. */
async function until(what: string, holds: () => Promise<boolean>, within: number): Promise<void> {
  const ends = performance.now() + within
  while (!(await holds())) {
    assert.ok(performance.now() < ends, `never: ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}

test('[44-6] a call through a dropped network is held and drawn as held, sent in its order once the network is back, run once when its answer was cut, failed with T0036 after callHold, and kept over a move', async () => {
  const at = await served('heldCalls', { for: 'dev' })
  /** The words of the notes, in the order they were added. */
  const notes = async (): Promise<string[]> => {
    const rows: unknown = await at.app.call('allNotes', {}, { as: system })
    return (Array.isArray(rows) ? rows : [])
      .map((one) => ({ id: String(Object(one).id), words: String(Object(one).words) }))
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((one) => one.words)
  }
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${at.address}/notes`)
      const before = (await notes()).length

      // With the network cut, as the browser says, both presses are held and drawn as held, and nothing fails.
      await page.context().setOffline(true)
      await page.waitForFunction(() => !navigator.onLine)
      await page.getByRole('button', { name: 'Add the first' }).click()
      await page.getByRole('button', { name: 'First waits' }).waitFor()
      await page.getByRole('button', { name: 'Add the second' }).click()
      await page.getByRole('button', { name: 'Second waits' }).waitFor()
      await page.waitForTimeout(500)
      assert.equal(await page.getByText(/T0\d{3}/).count(), 0, said)
      assert.equal((await notes()).length, before, said)

      // With it back, they are sent in the order they were made, and each runs once.
      await page.context().setOffline(false)
      await page.getByRole('button', { name: 'Add the first' }).waitFor()
      await page.getByRole('button', { name: 'Add the second' }).waitFor()
      await until('both calls ran', async () => (await notes()).length === before + 2, 10_000)
      assert.deepEqual((await notes()).slice(before), ['first', 'second'], said)

      // A call whose answer is cut on the way back is sent again, and the change runs once.
      await page.route(
        '**/_t/call/addNote',
        async (route) => {
          await route.fetch()
          await route.abort('internetdisconnected')
        },
        { times: 1 },
      )
      await page.getByRole('button', { name: 'Add the first' }).click()
      await until('the cut call ran', async () => (await notes()).length === before + 3, 10_000)
      await page.getByRole('button', { name: 'Add the first' }).waitFor()
      await page.waitForTimeout(2500)
      assert.equal((await notes()).length, before + 3, `the call sent again ran once ${said}`)

      // A call held past callHold fails with T0036, and is never sent.
      await page.context().setOffline(true)
      await page.waitForFunction(() => !navigator.onLine)
      await page.getByRole('button', { name: 'Add the first' }).click()
      await page.getByRole('button', { name: 'First waits' }).waitFor()
      await page.getByRole('button', { name: 'First T0036' }).waitFor({ timeout: 10_000 })
      await page.context().setOffline(false)
      await page.waitForTimeout(2500)
      assert.equal((await notes()).length, before + 3, `the call held too long was never sent ${said}`)

      // A move to another screen keeps what is held, which is sent once its call goes through.
      await page.route('**/_t/call/addNote', (route) => route.abort('internetdisconnected'))
      await page.getByRole('button', { name: 'Add the second' }).click()
      await page.getByRole('button', { name: 'Second waits' }).waitFor()
      await page.getByRole('link', { name: 'To the other screen' }).click()
      await page.getByRole('heading', { name: 'The other screen' }).waitFor()
      await page.unroute('**/_t/call/addNote')
      await until('the call held over the move ran', async () => (await notes()).length === before + 4, 20_000)
    })
})
