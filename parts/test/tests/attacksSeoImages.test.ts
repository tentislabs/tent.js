import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** The pictures the app keeps of its shared links. */
function keptIn(dataFolder: string): string[] {
  try {
    return readdirSync(join(dataFolder, 'seoImages'))
  } catch {
    return []
  }
}

/** The project of the pictures, with a limit of drawings a minute and products of each color it is handed. */
const shop = (colors: string[], perMinute: number) => (folder: string) => {
  const project = join(folder, 'tent.ts')
  writeFileSync(
    project,
    readFileSync(project, 'utf8').replace(
      'screensPerMinute: 100000',
      `screensPerMinute: 100000, seoImagesPerMinute: ${perMinute}`,
    ),
  )
  const seeded = colors.map((color, n) => `  db.products.add({ title: 'Product ${n}', color: '${color}' })`).join('\n')
  writeFileSync(
    join(folder, 'seed.ts'),
    `import { seed } from 'tentjs'\n\nexport default seed(({ db }) => {\n${seeded}\n})\n`,
  )
}

/** The ids of the products of the app, oldest title first. */
async function productsOf(at: Served): Promise<string[]> {
  const rows: unknown = await at.app.call('allProducts', {}, { as: { kind: 'system' } })
  return (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).id))
}

test('[44-10.5] a stranger who asks for the pictures of many made-up addresses draws nothing: each answers 404 alike', async () => {
  const at = await served('seoImages', { change: shop(['#ff0000'], 30) })
  const made = [
    ...Array.from({ length: 40 }, (_, n) => `/_t/seo/image/productScreen?/products/made-up-${n}`),
    '/_t/seo/image/productScreen?/about',
    '/_t/seo/image/productScreen?//elsewhere.example/products/1',
    '/_t/seo/image/productScreen?https://elsewhere.example/products/1',
    '/_t/seo/image/noSuchScreen?/products/1',
    '/_t/seo/image/aboutScreen?/about',
    '/_t/seo/image/productScreen?%E0%A4%A',
    '/_t/seo/image/productScreen',
  ]
  for (const path of made) {
    const answer = await fetch(`${at.address}${path}`)
    await answer.arrayBuffer()
    assert.equal(answer.status, 404, path)
  }
  assert.deepEqual(keptIn(at.dataFolder), [])
})

test('[44-10.5] the drawings of pictures are bounded by seoImagesPerMinute for the app, and a picture kept is answered past it', async () => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff']
  const at = await served('seoImages', { change: shop(colors, 2) })
  const ids = await productsOf(at)
  const picture = (id: string | undefined): string => `${at.address}/_t/seo/image/productScreen?/products/${String(id)}`
  // Asked at once, the drawings are made one after another: two in a minute, or four where they cross into the
  // next one, and the rest are refused.
  const began = Date.now()
  const answers = await Promise.all(ids.map((id) => fetch(picture(id))))
  for (const one of answers) await one.arrayBuffer()
  const drawn = answers.filter((one) => one.status === 200).length
  const minutes = Math.floor(Date.now() / 60_000) - Math.floor(began / 60_000) + 1
  assert.ok(drawn >= 2 && drawn <= 2 * minutes, `${drawn} drawn in ${minutes} minutes`)
  assert.ok(
    answers.every((one) => one.status === 200 || one.status === 429),
    answers.map((one) => one.status).join(' '),
  )
  assert.equal(keptIn(at.dataFolder).length, drawn)
  // A picture that was kept is answered from what was kept, past the bound.
  const kept = answers.findIndex((one) => one.status === 200)
  const again = await fetch(picture(ids[kept]))
  await again.arrayBuffer()
  assert.equal(again.status, 200)
})

test('[44-10.5] names after the question mark that are no state of the screen draw no new picture and keep no new file', async () => {
  const at = await served('seoImages', { change: shop(['#ff0000'], 30) })
  const [lamp] = await productsOf(at)
  const address = `${at.address}/_t/seo/image/productScreen?/products/${String(lamp)}`
  for (const more of ['', '?x=1', '?x=2', '?made=up&more=3', '?utm_source=a']) {
    const answer = await fetch(`${address}${more}`)
    await answer.arrayBuffer()
    assert.equal(answer.status, 200, more)
  }
  // 32-forms-and-navigation, section 7, point 4: a name that is no state of the screen is no part of the key.
  assert.equal(keptIn(at.dataFolder).length, 1, keptIn(at.dataFolder).join(', '))
})

test('[44-10.6] the picture of a shared link is drawn as nobody, whatever the request that asks for it carries', async () => {
  const at = await served('seoImages', { change: shop(['#ff0000'], 30) })
  const [lamp] = await productsOf(at)
  const address = `${at.address}/_t/seo/image/productScreen?/products/${String(lamp)}`
  const plain = new Uint8Array(await (await fetch(address)).arrayBuffer())
  const carried = await fetch(address, {
    headers: {
      cookie: `tent_session.shop=${'s'.repeat(43)}; tent_visitor.shop=${'v'.repeat(32)}`,
      authorization: 'Bearer made-up',
    },
  })
  assert.equal(carried.status, 200)
  assert.deepEqual(new Uint8Array(await carried.arrayBuffer()), plain)
  assert.equal(keptIn(at.dataFolder).length, 1)
})
