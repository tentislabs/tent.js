import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

/** A change over a number of stars, and a screen whose form holds a control of the builder's own. */
const rated = {
  'rated.ts': `import { change, input, number, table } from 'tentjs'

export const ratings = table('ratings', {
  columns: { stars: number() },
  access: { read: 'anyone', add: 'anyone' },
})

export const rate = change('rate', {
  access: 'anyone',
  input: { stars: number({ min: 1, max: 5, whole: true }) },
  set: ratings.add({ stars: input('stars') }),
})
`,
  'rate.tsx': `import { screen, useField, Form } from 'tentjs/ui'
import { rate } from './rated'

// A control of the builder's own: an input of its own, which the form fills, checks and gives the focus.
function Stars(o: { name: string }) {
  const field = useField(o.name)
  return (
    <span>
      <input
        aria-label="Stars"
        data-own="stars"
        ref={field.ref}
        value={field.value === undefined ? '' : String(field.value)}
        onChange={(event) => field.set(event.target.value === '' ? undefined : Number(event.target.value))}
      />
      <span data-own="error">{field.error ?? ''}</span>
    </span>
  )
}

export const rateScreen = screen('rateScreen', {
  path: '/rate',
  access: 'anyone',
  view: () => (
    <Form id="rating" call={rate}>
      <Stars name="stars" />
      <button type="submit" id="send">Rate</button>
    </Form>
  ),
})
`,
}

for (const engine of browserEngines)
  test(`[32-15] a component of the builder's own that calls useField fills the form, is shown its error and takes the focus when it fails, in ${engine}`, async () => {
    const { address, app } = await served('formed', {
      change: (folder) => {
        for (const [file, text] of Object.entries(rated)) writeFileSync(join(folder, file), text)
      },
    })
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const calls: string[] = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/_t/call/')) calls.push(request.url())
      })
      await alive(page, `${address}/rate`)
      const stars = page.locator('[data-own="stars"]')
      await stars.fill('9')
      // The button takes the focus first, so that the form is seen to move it.
      await page.locator('#send').focus()
      await page.locator('#send').click()
      await page.waitForFunction(() => (document.querySelector('[data-own="error"]')?.textContent ?? '') !== '')
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-own')), 'stars')
      assert.deepEqual(calls, [])
      await stars.fill('4')
      await page.locator('#send').click()
      await page.waitForFunction(() => document.querySelector('[data-own="error"]')?.textContent === '')
      await page.waitForFunction(() => document.querySelector('[data-own="stars"]')?.getAttribute('value') === '')
      assert.equal(calls.length, 1)
      assert.deepEqual(said, [])
    })
    const rows: unknown[] = Object(await app.read({ from: 'ratings' }, { as: 'system' }))
    assert.deepEqual(
      rows.map((one) => Object(one).stars),
      [4],
    )
  })
