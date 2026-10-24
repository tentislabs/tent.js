import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

/** The pictures the app keeps of its shared links. */
function keptIn(dataFolder: string): string[] {
  try {
    return readdirSync(join(dataFolder, 'seoImages'))
  } catch {
    return []
  }
}

/** The project of the pictures with three products, the limits it is handed, and a cache of the product screen. */
const shop = (limits: string, cache?: string) => (folder: string) => {
  const project = join(folder, 'tent.ts')
  writeFileSync(
    project,
    readFileSync(project, 'utf8').replace('screensPerMinute: 100000', `screensPerMinute: 100000, ${limits}`),
  )
  if (cache) {
    const screens = join(folder, 'screens.tsx')
    writeFileSync(
      screens,
      readFileSync(screens, 'utf8').replace("  title: 'A product',", `  title: 'A product',\n  cache: '${cache}',`),
    )
  }
  const seeded = [0, 1, 2].map((n) => `  db.products.add({ title: 'Product ${n}', color: '#00ff00' })`).join('\n')
  writeFileSync(
    join(folder, 'seed.ts'),
    `import { seed } from 'tentjs'\n\nexport default seed(({ db }) => {\n${seeded}\n})\n`,
  )
}

/** Asks for the picture of the address of a product, and answers its status. */
async function pictureOf(address: string, product: string): Promise<number> {
  const answer = await fetch(`${address}/_t/seo/image/productScreen?/products/${product}`)
  await answer.arrayBuffer()
  return answer.status
}

test('[44-10.5] the pictures of one screen are kept up to pageCachePerScreen, the oldest dropped first', async () => {
  const at = await served('seoImages', { change: shop('seoImagesPerMinute: 30, pageCachePerScreen: 2') })
  const rows: unknown = await at.app.call('allProducts', {}, { as: { kind: 'system' } })
  const products = (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).id))
  assert.equal(products.length, 3)
  for (const product of products) assert.equal(await pictureOf(at.address, product), 200)
  // 32-forms-and-navigation, section 7, point 6: one screen keeps no more than its bound.
  assert.equal(keptIn(at.dataFolder).length, 2, keptIn(at.dataFolder).join(', '))
})

test('[44-10.5] a picture of a screen with a cache is drawn again once that time is up', async () => {
  const at = await served('seoImages', { change: shop('seoImagesPerMinute: 30', '1 second') })
  const rows: unknown = await at.app.call('allProducts', {}, { as: { kind: 'system' } })
  const [product] = (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).id))
  assert.equal(await pictureOf(at.address, String(product)), 200)
  const [file] = keptIn(at.dataFolder)
  const first = statSync(join(at.dataFolder, 'seoImages', String(file))).mtimeMs
  await new Promise((done) => setTimeout(done, 1500))
  assert.equal(await pictureOf(at.address, String(product)), 200)
  // 32-forms-and-navigation, section 7, point 5: dropped when its time is up, and drawn afresh.
  const again = statSync(join(at.dataFolder, 'seoImages', String(file))).mtimeMs
  assert.ok(again > first, `the picture was drawn again: ${first} then ${again}`)
})

test('[44-10.5] the request that draws a picture answers the picture it drew, however long the hidden browser takes to end after it: with a cache shorter than any drawing, each request is answered a picture drawn afresh', async () => {
  const at = await served('seoImages', { change: shop('seoImagesPerMinute: 30', '1 ms') })
  const rows: unknown = await at.app.call('allProducts', {}, { as: { kind: 'system' } })
  const [product] = (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).id))
  assert.equal(await pictureOf(at.address, String(product)), 200)
  const [file] = keptIn(at.dataFolder)
  const first = statSync(join(at.dataFolder, 'seoImages', String(file))).mtimeMs
  assert.equal(await pictureOf(at.address, String(product)), 200)
  // 32-forms-and-navigation, section 7, point 5: past its time at once, so the second request drew it again.
  const again = statSync(join(at.dataFolder, 'seoImages', String(file))).mtimeMs
  assert.ok(again > first, `the picture was drawn again: ${first} then ${again}`)
})
