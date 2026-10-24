import assert from 'node:assert/strict'
import { test } from 'node:test'
import { project } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import { createElement } from '../borrowed/react.ts'
import type { Page } from '../draw.ts'
import { draw } from '../draw.ts'
import { asset, Image, screen } from '../index.ts'
import { drawingOf, pageOf, reader, recordOf } from './drawn.ts'

// A file of the app that a user uploaded, by its id, and what the engine knows of it.
const photo = 'abcdefghjkmnpqrstvwxyz0123'
const tiny = 'data:image/webp;base64,AAAA'

/**
 * Draws a screen whose view is the one function, in a project that lists one host, with an asset of a known size,
 * the engine telling of each picture what `told` says. Answers what the draw made.
 */
async function pictured(
  view: () => unknown,
  told: (src: { asset: string } | { file: string }) => object | undefined = () => undefined,
  page: Partial<Page> = {},
) {
  const made = describe({
    definitions: [
      { value: project('shop', { hosts: ['https://pictures.example.com'] }) },
      { value: screen('shown', { path: '/shown', access: 'anyone', view: () => null }) },
    ],
  })
  assert.deepEqual(made.findings, [])
  const description = made.description
  description.assets = { 'scene.png': { file: 'assets/scene.0123456789ab.png', width: 800, height: 400 } }
  const { read } = reader()
  return await draw({
    description,
    page: pageOf('shown', page),
    read,
    views: { shown: { name: 'shown', kind: 'screen', view } },
    picture: told,
  })
}

/** The `<img>` of a drawing that carries an alt text, as it was written. */
function img(drawing: string, alt: string): string {
  const found = new RegExp(`<img [^>]*alt="${alt}"[^>]*>`).exec(drawing)
  assert.ok(found, `no picture "${alt}" in ${drawing}`)
  return found[0]
}

test('[30-4] an Image of an asset is drawn in the widths of the image door, with its width and its height taken from its file, and loads when it is near the view', async () => {
  const made = await pictured(() =>
    createElement('main', null, createElement(Image, { src: asset('scene.png'), alt: 'A scene', className: 'wide' })),
  )
  const one = img(drawingOf(made.html), 'A scene')
  assert.match(one, /width="800"/)
  assert.match(one, /height="400"/)
  assert.match(one, /class="wide"/)
  assert.match(one, /loading="lazy"/)
  assert.match(one, /src="\/_t\/b\/assets\/scene\.0123456789ab\.png"/)
  // Every width of the door that ships is named, by the fingerprint of the asset.
  for (const width of [320, 640, 960, 1280, 1920, 2560])
    assert.ok(one.includes(`/_t/img/a/scene.png?w=${width}&amp;v=0123456789ab ${width}w`), one)
  assert.match(one, /sizes="100vw"/)
  assert.deepEqual(
    made.pictures.map((picture) => picture.src),
    [{ asset: 'scene.png' }],
  )
})

test('[30-4] an Image of a file shows its tiny copy until it has loaded, is named in the widths up to its own, and with priority loads with the page and is named in the head', async () => {
  const made = await pictured(
    () =>
      createElement(
        'main',
        null,
        createElement(Image, { src: photo, alt: 'A photo', width: 300, height: 150, sizes: '300px', priority: true }),
      ),
    (src) => ('file' in src ? { tiny, width: 700 } : undefined),
  )
  const drawing = drawingOf(made.html)
  const one = img(drawing, 'A photo')
  assert.ok(one.includes(`background-image:url(&quot;${tiny}&quot;)`), one)
  // The door scales down and never up: of the widths at and above 700, only 960 is named, at 700.
  assert.ok(one.includes(`/_t/img/${photo}?w=640 640w, /_t/img/${photo}?w=960 700w"`), one)
  assert.ok(!one.includes('?w=1280'), one)
  assert.match(one, /sizes="300px"/)
  assert.match(one, /loading="eager"/)
  assert.match(one, /fetchpriority="high"/i)
  assert.match(
    made.html ?? '',
    new RegExp(
      `<link rel="preload" as="image" href="/_t/files/${photo}" imagesrcset="[^"]+" imagesizes="300px" fetchpriority="high">`,
    ),
  )
  assert.deepEqual(recordOf(made.html).pictures, { [photo]: { tiny, width: 700 } })
})

test('[30-4] in an exported page an Image is a picture with the smaller formats it was written in, for the browser to pick', async () => {
  const made = await pictured(
    () => createElement(Image, { src: photo, alt: 'Exported', width: 300, height: 150 }),
    () => ({
      files: { 320: '/_t/img/abc.320.png', 640: '/_t/img/abc.640.png' },
      formats: { 'image/avif': { 320: '/_t/img/abc.320.avif', 640: '/_t/img/abc.640.avif' } },
    }),
    { exported: true, imageWidths: [320, 640] },
  )
  const drawing = drawingOf(made.html)
  assert.match(
    drawing,
    /<picture[^>]*><source type="image\/avif" srcset="\/_t\/img\/abc\.320\.avif 320w, \/_t\/img\/abc\.640\.avif 640w"/i,
  )
  assert.match(img(drawing, 'Exported'), /src="\/_t\/img\/abc\.640\.png"/)
})

test('[30-4] an Image of a listed host is loaded from that host, one of a host that is not listed loads nothing, and an asset that no file has draws nothing', async () => {
  const made = await pictured(() =>
    createElement(
      'main',
      null,
      createElement(Image, { src: 'https://pictures.example.com/a.png', alt: 'Listed', width: 10, height: 10 }),
      createElement(Image, { src: 'https://elsewhere.example.com/a.png', alt: 'Not listed', width: 10, height: 10 }),
      createElement(Image, { src: asset('missing.png'), alt: 'Missing' }),
    ),
  )
  const drawing = drawingOf(made.html)
  assert.match(img(drawing, 'Listed'), /src="https:\/\/pictures\.example\.com\/a\.png"/)
  assert.doesNotMatch(img(drawing, 'Not listed'), /src=|srcset=/i)
  assert.doesNotMatch(drawing, /elsewhere\.example\.com/)
  assert.doesNotMatch(drawing, /Missing/)
  assert.deepEqual(made.pictures, [])
})
