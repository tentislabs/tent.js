import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

/** A query of every slug that is never live, which may answer more rows than a live one, and a screen it lists. */
const many = {
  'many.ts': `import { query } from 'tentjs'
import { products } from './functions'

export const everySlug = query('everySlug', { access: 'anyone', live: false, rows: products.oldest('slug') })
`,
  'many.tsx': `import { screen, read } from 'tentjs/ui'
import { everySlug } from './many'

export const manyScreen = screen('manyScreen', {
  path: '/many/:slug',
  access: 'anyone',
  seo: { addresses: read(everySlug) },
  view: ({ params }) => <h1>{params.slug}</h1>,
})
`,
}

test('[32-10] past 50,000 addresses /sitemap.xml lists the files of the sitemap, each of which lists 50,000 addresses at most, in their order', async () => {
  const { address, app } = await served('indexed', {
    change: (folder) => {
      for (const [file, text] of Object.entries(many)) writeFileSync(join(folder, file), text)
    },
  })
  const count = 50_001
  for (let from = 0; from < count; from += 10_000) {
    const rows = Array.from({ length: Math.min(10_000, count - from) }, (_, k) => {
      const slug = `p${String(from + k).padStart(6, '0')}`
      return { add: 'products', values: { slug, name: slug, summary: '' } }
    })
    await app.write(rows, { as: 'system' })
  }
  const index = await (await fetch(`${address}/sitemap.xml`)).text()
  assert.match(index, /^<\?xml[^>]*>\n<sitemapindex /)
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((one) => one[1])
  assert.deepEqual(files, [`${address}/sitemap-1.xml`, `${address}/sitemap-2.xml`])
  const first = await (await fetch(`${address}/sitemap-1.xml`)).text()
  const second = await (await fetch(`${address}/sitemap-2.xml`)).text()
  const listed = [...first.matchAll(/<loc>([^<]+)<\/loc>/g), ...second.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (one) => one[1],
  )
  assert.equal((first.match(/<url>/g) ?? []).length, 50_000)
  assert.ok(listed.length > count)
  assert.ok(listed.includes(`${address}/many/p050000`))
  assert.deepEqual(listed, [...listed].sort())
  assert.equal((await fetch(`${address}/sitemap-3.xml`)).status, 404)
})
