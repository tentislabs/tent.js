import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import { readPng } from '../../../rig/png.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** A picture of one red pixel, as a PNG file. */
const red = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

/** Serves the red picture on a port of this computer, and answers the port and how many times it was asked for. */
async function pictureServer(): Promise<{ port: number; asked: () => number; close: () => Promise<void> }> {
  let asked = 0
  const server = createServer((_, answer) => {
    asked += 1
    answer.writeHead(200, { 'content-type': 'image/png' })
    answer.end(red)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const where = server.address()
  const port = typeof where === 'object' && where !== null ? where.port : 0
  return { port, asked: () => asked, close: () => new Promise((done) => server.close(() => done())) }
}

/** The color of one pixel of a picture, as `#rrggbb`. */
function colorAt(file: string, x: number, y: number): string {
  const { width, pixels } = readPng(new Uint8Array(readFileSync(file)))
  const at = (y * width + x) * 4
  return `#${[pixels[at], pixels[at + 1], pixels[at + 2]].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

/** Serves the project of the pictures, with the port of the picture that lies inside this computer's own network. */
const shop = (port: number): Promise<Served> =>
  served('shot', {
    change: (folder) => {
      for (const name of ['tent.ts', 'board.tsx']) {
        const file = join(folder, name)
        writeFileSync(file, readFileSync(file, 'utf8').replaceAll('PICTURE_PORT', String(port)))
      }
    },
  })

test('[32-12] [05-9.4] app.shot writes a picture of a screen as nobody, at the asked size, and the picture holds the rows', async () => {
  const picture = await pictureServer()
  try {
    const at = await shop(picture.port)
    const out = join(at.dataFolder, 'board.png')
    const shot = await at.app.shot('/board', { size: { width: 640, height: 400 }, out })
    assert.deepEqual(shot, { file: out, width: 640, height: 400, status: 200 })
    const { width, height } = readPng(new Uint8Array(readFileSync(out)))
    assert.deepEqual([width, height], [640, 400])
    // The two rows are drawn: a red tile and a blue one, and nothing a signed-in caller would see.
    assert.equal(colorAt(out, 50, 50), '#ff0000')
    assert.equal(colorAt(out, 150, 50), '#0000ff')
    assert.equal(colorAt(out, 250, 50), '#ffffff')
    // The picture on an address inside this computer's own network is left out: the browser never reached it.
    assert.equal(picture.asked(), 0)
    // With full the whole height of the page is taken.
    const tall = await at.app.shot('/board', {
      size: { width: 640, height: 100 },
      full: true,
      out: join(at.dataFolder, 'tall.png'),
    })
    assert.ok(tall.height >= 300, String(tall.height))
  } finally {
    await picture.close()
  }
})

test('[32-12] a picture as a user holds what that user sees, and one with no out is written into shots/ of the folder of the engine', async () => {
  const picture = await pictureServer()
  try {
    const at = await shop(picture.port)
    const out = join(at.dataFolder, 'user.png')
    // The user is the one row of `users` that the seed wrote, named by its id, as `tent shot --as` names one.
    const [ada] = Object(await at.app.read({ from: 'users' }, { as: 'system' }))
    await at.app.shot('/board', { as: String(Object(ada).id), size: { width: 640, height: 400 }, out })
    assert.equal(colorAt(out, 250, 50), '#00ff00')
    const said = await at.app.shot('/board', { size: { width: 320, height: 200 } })
    const file = said.file
    assert.ok(file.startsWith(join(at.dataFolder, 'shots')), file)
    assert.match(file, /\.png$/)
    assert.deepEqual([said.width, said.height, said.status], [320, 200, 200])
    assert.equal(colorAt(file, 50, 50), '#ff0000')
  } finally {
    await picture.close()
  }
})
