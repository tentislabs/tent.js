import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { movedClock, rowsOf, servedLive } from './living.ts'

const system = { kind: 'system' } as const

/** Opens an address of the app, and waits until the page has come alive: from then on its calls are taken. */
async function alive(page: Page, address: string): Promise<void> {
  await page.goto(address)
  await page.locator('#tent[data-t-alive]').waitFor()
}

/** Waits until a page shows a title of the row as its heading. */
const titled = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).waitFor()

/** Waits until a page shows a line of text. */
const shows = (page: Page, line: string) => page.getByText(line, { exact: true }).waitFor()

/** Does what a field or a button of the view would do, by the name the view gave it, and answers what the page said of it. */
const does = (page: Page, name: string, ...given: string[]): Promise<unknown> =>
  page.evaluate(([what, values]) => Reflect.get(window, what)(...values), [name, given] as const)

test('[21-23] several people at one row, with two pages of a browser: two changes sent at one moment are each whole, a change that compares what its page saw says no to the second person and writes nothing, two people who change two fields both get through, each page is sent the change of the other, a table of updates is held whole and in the order of its ids, and who is here drops out with no write', async (t) => {
  const moved = movedClock()
  const at = await servedLive(t, { project: 'together', clock: moved.clock })
  const doc = async (): Promise<Record<string, unknown>> => rowsOf(await at.app.call('theDoc', {}, { as: system }))[0]
  const id = String((await doc()).id)
  const rowsIn = async (table: string): Promise<Record<string, unknown>[]> =>
    rowsOf(await at.app.read({ from: table, sort: [{ by: 'id' }] }, { as: 'system' }))

  for (const engine of browserEngines)
    await inBrowser(engine, async (ada) => {
      const said = `in ${engine}`
      await at.app.write([{ change: 'docs', id, values: { title: 'First', body: 'Start' } }], { as: 'system' })
      const bob = await ada.context().newPage()
      for (const page of [ada, bob]) {
        await alive(page, `${at.origin}/doc`)
        await titled(page, 'First')
      }

      // Two changes sent at one moment are carried out one after the other, and each is whole: the row never
      // holds the title of one and the body of the other. Each page is sent the change of the other.
      for (let round = 0; round < 5; round++) {
        const sent = await Promise.all([does(ada, 'setBoth', `Ada ${round}`), does(bob, 'setBoth', `Bob ${round}`)])
        assert.deepEqual(sent, ['saved', 'saved'], said)
        const row = await doc()
        assert.equal(row.title, row.body, said)
        assert.ok([`Ada ${round}`, `Bob ${round}`].includes(String(row.title)), said)
        for (const page of [ada, bob]) {
          await titled(page, String(row.title))
          await shows(page, `body: ${String(row.body)}`)
        }
      }

      // A change that compares the field it sets with what its page saw: both people began with the same title.
      // The first is saved. The second is told no, in the code that the builder gave it, and nothing is written.
      await does(ada, 'begin', 'title')
      await does(bob, 'begin', 'title')
      assert.equal(await does(ada, 'save', 'title', 'By Ada'), 'saved', said)
      const first = await doc()
      assert.equal(await does(bob, 'save', 'title', 'By Bob'), 'changed', said)
      assert.deepEqual(await doc(), first, said)
      // The page that was told no shows the value that stands, which its watch brought.
      await titled(bob, 'By Ada')

      // Two people who change two fields of the row both get through, whoever is first.
      await does(ada, 'begin', 'title')
      await does(bob, 'begin', 'body')
      const two = await Promise.all([
        does(ada, 'save', 'title', 'Title of Ada'),
        does(bob, 'save', 'body', 'Body of Bob'),
      ])
      assert.deepEqual(two, ['saved', 'saved'], said)
      for (const page of [ada, bob]) {
        await titled(page, 'Title of Ada')
        await shows(page, 'body: Body of Bob')
      }

      // A table of updates that one page adds to, many at one moment: the other page holds every one of them
      // once, in the order of their ids, which is the order of the writes.
      const texts = Array.from({ length: 40 }, (_, i) => `update ${engine} ${i}`)
      const added = await ada.evaluate(
        (list) => Promise.all(list.map((text) => Reflect.get(window, 'addUpdate')(text))),
        texts,
      )
      assert.deepEqual(
        added,
        texts.map(() => 'saved'),
        said,
      )
      const held = (await rowsIn('updates')).map((row) => String(row.text))
      assert.equal(held.filter((text) => texts.includes(text)).length, 40, said)
      for (const page of [ada, bob]) {
        await shows(page, `${held.length} updates`)
        const lines = (await page.locator('main').innerText()).split('\n').map((line) => line.trim())
        assert.deepEqual(
          lines.filter((line) => line.startsWith('update ')),
          held,
          said,
        )
      }

      // Who is here: a person says that they look, and the other page shows them. Once their moment has passed
      // they drop out of the query, which is asked again by its `refresh`, with no write.
      await shows(bob, 'here: nobody')
      assert.equal(await does(ada, 'look', 'Ada'), 'saved', said)
      await shows(bob, 'here: Ada')
      const written = (await rowsIn('here')).length
      moved.advance(6000)
      await shows(bob, 'here: nobody')
      await shows(ada, 'here: nobody')
      assert.equal((await rowsIn('here')).length, written, said)
    })
})
