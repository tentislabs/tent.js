import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { hostOf } from './exporting.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'
import type { Site } from './sited.ts'
import { site } from './sited.ts'
import { resizerStandIn, standIn } from './standIns.ts'

// The project of media is built and served once for the tests of this file, beside a site of another host. The
// site's address is the one host that the project lists; the same site under another name is a host it does not.
let common: Promise<{ shop: Served; site: Site; away: string }> | undefined
const shop = (): Promise<{ shop: Served; site: Site; away: string }> => {
  common ??= servedAnew()
  return common
}

/** The project of media, built and served anew beside a site of its own. */
async function servedAnew(): Promise<{ shop: Served; site: Site; away: string }> {
  const other = await site()
  const away = other.address.replace('127.0.0.1', 'localhost')
  const written = (folder: string): void => {
    for (const file of readdirSync(folder).filter((one) => /\.tsx?$/.test(one))) {
      const text = readFileSync(join(folder, file), 'utf8')
      writeFileSync(join(folder, file), text.replaceAll('SITE', other.address).replaceAll('AWAY', away))
    }
  }
  return { shop: await served('media', { change: written }), site: other, away }
}

/**
 * What a page wrote that no page should, but the style that the driver of WebKit adds to a page to take a picture
 * of it, which the page's own policy refuses as it should.
 */
const ownComplaints = (said: string[], engine: string): string[] =>
  said.filter((one) => engine !== 'webkit' || !/^error: Refused to apply a stylesheet/.test(one))

/** What an export names that it did not write, and why. */
type Skipped = { what: string; why: string }

// The export of the app, written once for the tests of this file that read it.
// Before it, the system adds a draft whose photo a visitor may not download.
let exported: Promise<{ folder: string; host: string; skipped: Skipped[]; draft: string }> | undefined
const exportOnce = (): Promise<{ folder: string; host: string; skipped: Skipped[]; draft: string }> => {
  exported ??= (async () => {
    const { shop: app } = await shop()
    const draft = String(await app.app.call('putDraft', {}, { as: { kind: 'system' } }))
    await app.app.call('addDraft', { photo: draft }, { as: { kind: 'system' } })
    const folder = join(app.dataFolder, 'site')
    const { skipped } = await app.app.export(folder, { origin: 'https://shop.example.com' })
    return { folder, host: await hostOf(folder, ''), skipped, draft }
  })()
  return exported
}

test("[05-9.4] tent shot of a screen with a picture from an address inside this computer's own network is taken without it", async () => {
  const { shop: app, site: other } = await shop()
  const before = other.asked.length
  const out = join(app.dataFolder, 'pictures.png')
  const pictures = await app.app.shot('/pictures', { size: { width: 400, height: 400 }, out })
  assert.equal(pictures.status, 200)
  assert.deepEqual(other.asked.slice(before), [], 'the browser that takes the picture never reached the site')
})

test('[32-13@8b] tent export writes each picture of the app that its pages show as files, in the widths a page may ask for', async () => {
  const { folder } = await exportOnce()
  const files = readdirSync(join(folder, '_t', 'img'))
  assert.ok(files.includes('a-scene.png.320.png'), files.join(', '))
  // A picture smaller than every width is written once, at the first width at or above its own.
  assert.ok(!files.includes('a-scene.png.640.png'), files.join(', '))
  const page = readFileSync(join(folder, 'pictures', 'index.html'), 'utf8')
  assert.ok(page.includes('/_t/img/a-scene.png.320.png 80w'), 'the page names the file of the picture')
  assert.ok(!page.includes('/_t/img/a/scene.png?'), 'and not the image door, which no engine may answer')
})

test('[32-13@8b] tent export writes no picture that a visitor could not download, and names it in skipped', async () => {
  const { folder, skipped, draft } = await exportOnce()
  assert.match(draft, /\S/)
  assert.ok(readFileSync(join(folder, 'drafts', 'index.html'), 'utf8').includes('A draft'), 'the page shows the draft')
  const files = readdirSync(join(folder, '_t', 'img'))
  assert.deepEqual(
    files.filter((one) => one.startsWith(draft)),
    [],
    'no file of the picture is written',
  )
  assert.ok(
    skipped.some((one) => one.what.includes(draft) && one.why !== ''),
    JSON.stringify(skipped),
  )
})

test('[32-13@8b] tent export writes each picture once in the kind it has and once in each format of images.formats that is smaller, and an exported page names them so that the browser picks the one it takes', async (t) => {
  // A resizer stands in for the one that is fetched: it answers a few bytes, smaller than the picture, for a format.
  standIn(t, 'sharp', resizerStandIn)
  // An app of its own, which has asked for no resizer before the one that stands in.
  const { shop: app } = await servedAnew()
  const folder = join(app.dataFolder, 'site-formats')
  await app.app.export(folder, { origin: 'https://shop.example.com' })
  const files = readdirSync(join(folder, '_t', 'img'))
  for (const one of ['a-scene.png.320.png', 'a-scene.png.320.avif', 'a-scene.png.320.webp'])
    assert.ok(files.includes(one), `${one} among ${files.join(', ')}`)
  const page = readFileSync(join(folder, 'pictures', 'index.html'), 'utf8')
  const fixed = /<picture[^>]*>((?:<source[^>]*>)+)<img[^>]*id="fixed"/.exec(page)
  assert.ok(fixed, 'the picture of the page is a picture element with its sources before it')
  assert.match(fixed[1], /<source type="image\/avif" srcSet="\/_t\/img\/a-scene\.png\.320\.avif 80w"/i)
  assert.match(fixed[1], /<source type="image\/webp" srcSet="\/_t\/img\/a-scene\.png\.320\.webp 80w"/i)
  const record = JSON.parse(readFileSync(join(folder, '_t', 's', 'pictures.json'), 'utf8'))
  assert.deepEqual(Object.keys(Object(record.value.pictures['a/scene.png'].formats)).sort(), [
    'image/avif',
    'image/webp',
  ])
})

for (const engine of browserEngines) {
  test(`[32-13@8b] the pictures of an exported page are shown from its files, served by a plain host of files, in ${engine}`, async () => {
    const { host } = await exportOnce()
    await inBrowser(engine, async (page) => {
      await page.goto(`${host}/pictures/`)
      await page.waitForFunction((selector) => {
        const picture = document.querySelector(selector)
        return picture instanceof HTMLImageElement && picture.complete && picture.naturalWidth === 80
      }, '#fixed')
      assert.match(
        await page.locator('#fixed').evaluate((one) => (one instanceof HTMLImageElement ? one.currentSrc : '')),
        /\/_t\/img\/a-scene\.png\.320\.png$/,
      )
    })
  })
}

for (const engine of browserEngines) {
  test(`[30-4] an Image named by asset with a value of the state is shown, one whose name no asset has draws nothing, and a picture on a host that is not listed is not loaded, in ${engine}`, async () => {
    const { shop: app, site: other } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const before = other.asked.length
      await alive(page, `${app.address}/pictures`)
      await page.waitForFunction((selector) => {
        const picture = document.querySelector(selector)
        return picture instanceof HTMLImageElement && picture.complete && picture.naturalWidth > 0
      }, '#named')
      assert.equal(await page.locator('#missing').count(), 0, 'no asset has the name')
      await page.waitForFunction((selector) => {
        const picture = document.querySelector(selector)
        return picture instanceof HTMLImageElement && picture.complete && picture.naturalWidth > 0
      }, '#listed')
      const asked = other.asked.slice(before)
      assert.ok(asked.includes('/listed.png'), 'the listed host is asked')
      assert.ok(!asked.includes('/away.png'), 'a host that is not listed is never asked')
      assert.equal(await page.locator('#away').getAttribute('src'), null)
      // A picture of an asset that states no size takes the size of its file.
      const box = await page.locator('#fixed').boundingBox()
      assert.deepEqual([box?.width, box?.height], [80, 40])
      // The image door scales a picture down and never up: a picture smaller than every width is named at its own.
      const natural = await page
        .locator('#fixed')
        .evaluate((one) => (one instanceof HTMLImageElement ? one.naturalWidth : 0))
      assert.equal(natural, 80)
      assert.deepEqual(ownComplaints(said, engine), [])
    })
  })

  test(`[32-1] a Form over a function with a file field shows its control with the label and the help words of its type, uploads the file when it is picked, and sends its id: the photo is then shown, in ${engine}`, async () => {
    const { shop: app } = await shop()
    const photo = readFileSync(join(import.meta.dirname, 'media', 'assets', 'scene.png'))
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${app.address}/upload`)
      const control = page.getByLabel('The photo')
      assert.equal(await control.getAttribute('type'), 'file')
      assert.equal(await control.getAttribute('accept'), 'image/*')
      await page.getByLabel('Title').fill('A scene')
      const sent = page.waitForResponse((answer) => answer.url().includes('/_t/files?'))
      await control.setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: photo })
      const upload = await sent
      assert.equal(upload.status(), 200)
      assert.match(upload.url(), /for=addPhoto&field=photo/)
      // The form sends once the upload has ended, and the screen it goes to shows the photo.
      await page.waitForFunction(
        (selector) =>
          !(
            document.querySelector(selector) instanceof HTMLInputElement &&
            document.querySelector(selector)?.hasAttribute('disabled')
          ),
        'input[type="file"]',
      )
      await page.locator('#handIn').getByText('Hand in').click()
      await page.waitForURL(/\/pictures$/)
      await page.waitForFunction((selector) => {
        const picture = document.querySelector(selector)
        return picture instanceof HTMLImageElement && picture.complete && picture.naturalWidth > 0
      }, '.photo')
      assert.match((await page.locator('.photo').last().getAttribute('src')) ?? '', /^\/_t\/files\/[0-9a-z]{26}$/)
      assert.match((await page.locator('.photo').last().getAttribute('srcset')) ?? '', /\/_t\/img\/[0-9a-z]{26}\?w=/)
      assert.deepEqual(ownComplaints(said, engine), [])
    })
  })
}
