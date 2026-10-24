import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { readPng } from '../../../rig/png.ts'
import { served } from './served.ts'

/** The color of one pixel of a picture, as `#rrggbb`. */
function colorAt(bytes: Uint8Array, x: number, y: number): string {
  const { width, pixels } = readPng(bytes)
  const at = (y * width + x) * 4
  return `#${[pixels[at], pixels[at + 1], pixels[at + 2]].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

/** The pictures the app keeps of its previews, each with when it was written. */
function keptIn(dataFolder: string): { name: string; at: number }[] {
  const folder = join(dataFolder, 'seoImages')
  try {
    return readdirSync(folder).map((name) => ({ name, at: statSync(join(folder, name)).mtimeMs }))
  } catch {
    return []
  }
}

test('[44-5] the picture of a screen whose seo.image names a component is a PNG of its size drawn from the answers of its address, kept until a write changes them, and named in the head of the screen', async () => {
  const at = await served('seoImages')
  const [lamp] = Object(await at.app.call('allProducts', {}, { as: { kind: 'system' } }))
  const address = `/products/${String(Object(lamp).id)}`
  const picture = `${at.address}/_t/seo/image/productScreen?${address}`

  // The first request draws the component with the screen's answers, into a PNG of the size it states.
  const first = await fetch(picture)
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('content-type'), 'image/png')
  const drawn = new Uint8Array(await first.arrayBuffer())
  const { width, height } = readPng(drawn)
  assert.deepEqual([width, height], [600, 315])
  assert.equal(colorAt(drawn, 5, 300), '#ff0000')
  const kept = keptIn(at.dataFolder)
  assert.equal(kept.length, 1)

  // A second request is answered from what was kept: nothing is drawn again.
  const second = await fetch(picture)
  assert.equal(second.status, 200)
  assert.deepEqual(new Uint8Array(await second.arrayBuffer()), drawn)
  assert.deepEqual(keptIn(at.dataFolder), kept)

  // A write to what it read draws it again, from the new answers.
  await at.app.call('paint', { product: String(Object(lamp).id), color: '#0000ff' }, { as: { kind: 'system' } })
  const third = await fetch(picture)
  assert.equal(third.status, 200)
  const redrawn = new Uint8Array(await third.arrayBuffer())
  assert.equal(colorAt(redrawn, 5, 300), '#0000ff')
  const now = keptIn(at.dataFolder)
  assert.equal(now.length, 1)
  assert.notDeepEqual(now, kept)

  // The head of the screen names the picture with its size, as seo writes its lines for a shared link.
  const page = await (await fetch(`${at.address}${address}`)).text()
  const meta = (name: string): string | undefined =>
    new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`).exec(page)?.[1]?.replaceAll('&amp;', '&')
  assert.equal(meta('og:image'), picture)
  assert.equal(meta('og:image:width'), '600')
  assert.equal(meta('og:image:height'), '315')

  // A screen whose seo.image names no component, and an address that the screen does not hold, answer 404 and draw nothing.
  assert.equal((await fetch(`${at.address}/_t/seo/image/aboutScreen?/about`)).status, 404)
  assert.equal((await fetch(`${at.address}/_t/seo/image/productScreen?/about`)).status, 404)
  assert.equal((await fetch(`${at.address}/_t/seo/image/productScreen?/products/nothing`)).status, 404)
  assert.equal(keptIn(at.dataFolder).length, 1)
  // A screen whose seo.image names no component has no such lines in its head.
  const about = await (await fetch(`${at.address}/about`)).text()
  assert.doesNotMatch(about, /og:image/)
})
