import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

// A package of fonts as Fontsource lays one out, a style file that names its font beside it, and a font of the
// project's own assets, which the project's style file names by its path. The bytes tell the two fonts apart.
const packageFont = new Uint8Array(5000).fill(3)
const ownFont = new Uint8Array(6000).fill(7)

/** Writes the package and the asset into the copy of the project, which git does not hold. */
function laid(folder: string): void {
  const files: Record<string, string | Uint8Array> = {
    'node_modules/tiny-font/package.json': JSON.stringify({ name: 'tiny-font', version: '1.0.0', main: 'index.css' }),
    'node_modules/tiny-font/index.css':
      '@font-face { font-family: "Tiny"; src: url(./files/tiny-latin-wght-normal.woff2) format("woff2"); }\n',
    'node_modules/tiny-font/files/tiny-latin-wght-normal.woff2': packageFont,
    'assets/own.woff2': ownFont,
  }
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
}

/** Every address that a style file names by `url()`, as a browser reads it against the address of the style file. */
function namedBy(css: string, at: string): string[] {
  return [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((one) => new URL(one[2], at).href)
}

for (const kind of ['release', 'dev'] as const)
  test(`[43-3] in a ${kind} build the font that a package's style file names, and an asset of the project's own that the project's style file names by its path, are served at the address the style file writes, under their fingerprints`, async () => {
    const { address, app, description, dataFolder } = await served('fonted', { for: kind, change: laid })
    const page = await app.page('/')
    assert.equal(page.status, 200)
    const sheets = [...page.html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
      (one) => new URL(one[1], address).href,
    )
    assert.ok(sheets.length > 0, 'the page names its style files')
    const fonts = new Map<string, Uint8Array>()
    for (const sheet of sheets) {
      const answer = await fetch(sheet)
      assert.equal(answer.status, 200, sheet)
      for (const named of namedBy(await answer.text(), sheet)) {
        const font = await fetch(named)
        assert.equal(font.status, 200, `${named}, named by ${sheet}`)
        fonts.set(new URL(named).pathname, new Uint8Array(await font.arrayBuffer()))
      }
    }
    const byBytes = (bytes: Uint8Array): string[] =>
      [...fonts].filter(([, one]) => Buffer.from(one).equals(Buffer.from(bytes))).map(([path]) => path)
    const [tiny] = byBytes(packageFont)
    assert.ok(tiny, `the package's font is named: ${[...fonts.keys()].join(', ')}`)
    assert.match(tiny, /^\/_t\/b\/browser\/[^/]*tiny-latin-wght-normal[^/]*\.[0-9a-f]{12}\.woff2$/)
    // The project's own font is the very file of its assets that `asset('own.woff2')` names, so a preload of it
    // and the face of the style file are one download.
    const asset = Object(description.assets['own.woff2']).file
    assert.deepEqual(byBytes(ownFont), [`/_t/b/${asset}`])

    // The exported site holds each font at the place the style file names: an export is made of a release.
    if (kind === 'dev') return
    const site = join(dataFolder, 'site')
    await app.export(site)
    for (const path of [tiny, `/_t/b/${asset}`])
      assert.equal(readFileSync(join(site, ...path.split('/').filter(Boolean))).length, fonts.get(path)?.length, path)
  })

for (const kind of ['release', 'dev'] as const)
  test(`[43-3] in a ${kind} build a font of under 4 kB that a package's style file names is served as a file of its own, which the page's own policy of fonts lets in, and is never written into the style file`, async () => {
    // A font smaller than the size under which the builder writes a file into what names it.
    const small = new Uint8Array(2000).fill(5)
    const { address, app } = await served('fonted', {
      for: kind,
      change: (folder) => {
        laid(folder)
        writeFileSync(join(folder, 'node_modules', 'tiny-font', 'files', 'tiny-latin-wght-normal.woff2'), small)
      },
    })
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(String(page.headers['content-security-policy']), /font-src 'self'[;\s]/)
    let found = false
    for (const one of page.html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
      const sheet = new URL(one[1], address).href
      const css = await (await fetch(sheet)).text()
      assert.doesNotMatch(css, /url\(\s*['"]?data:/, `${sheet} writes a font into itself`)
      for (const named of namedBy(css, sheet)) {
        const font = await fetch(named)
        assert.equal(font.status, 200, named)
        found ||= Buffer.from(await font.arrayBuffer()).equals(Buffer.from(small))
      }
    }
    assert.ok(found, 'the small font is served at the address its style file names')
  })
