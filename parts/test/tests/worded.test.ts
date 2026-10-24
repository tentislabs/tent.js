import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

/** The Turkish file of the shop, which is all that a second language adds beside the `languages` line. */
const turkish = `import { messages } from 'tentjs/ui'

export default messages('tr', {
  home: { title: 'Hoş geldiniz', open: 'Siparişleri gör' },
  orders: { title: 'Açık siparişler', count: { one: '{count} sipariş', other: '{count} sipariş' } },
  about: { title: 'Hakkımızda', words: 'Küçük bir dükkan' },
})
`

test('[32-9] a second language added to a finished three-screen app changes only the language files and the languages line', async () => {
  const one = await served('worded')
  assert.match((await one.app.page('/orders')).html, /<h1[^>]*>Open orders<\/h1>/)
  assert.equal((await one.app.page('/tr/orders')).status, 404)
  const two = await served('worded', {
    change: (folder) => {
      writeFileSync(join(folder, 'messages', 'tr.ts'), turkish)
      const file = join(folder, 'tent.ts')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace("title: 'Shop',", "title: 'Shop',\n  languages: ['en', 'tr'],"),
      )
    },
  })
  // `served` holds that the build found nothing: no screen file was changed for the second language.
  const pages = await Promise.all(['/tr', '/tr/orders', '/tr/about'].map((path) => two.app.page(path)))
  assert.deepEqual(
    pages.map((page) => /<h1[^>]*>(.*?)<\/h1>/.exec(page.html)?.[1]),
    ['Hoş geldiniz', 'Açık siparişler', 'Hakkımızda'],
  )
  assert.match(pages[1].html, />3 sipariş</)
  assert.match(pages[0].html, /href="\/tr\/orders"/)
  assert.match((await two.app.page('/orders')).html, /<h1[^>]*>Open orders<\/h1>/)
})
