import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import type { Running } from './apps.ts'
import { running } from './apps.ts'
import { partsWithResizer } from './resizerStandIn.ts'

/** One part of a PNG picture: its length, its name, its bytes and their check. */
function part(name: string, data: Uint8Array): Uint8Array {
  const body = Buffer.concat([Buffer.from(name, 'latin1'), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return out
}

/** A whole PNG picture of a width and a height. */
function picture(width: number, height: number): Uint8Array<ArrayBuffer> {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const lines = Buffer.alloc(height * (1 + width * 3))
  for (let at = 0; at < lines.length; at++) lines[at] = at % (1 + width * 3) === 0 ? 0 : (at * 2654435761) >>> 24
  const mark = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(mark),
      part('IHDR', head),
      part('IDAT', deflateSync(lines)),
      part('IEND', Buffer.alloc(0)),
    ]),
  )
}

/** A visitor of a test, who keeps the cookies it is handed: it uploads a file, and asks the image door. */
function visitor(run: Running) {
  const cookies = new Map<string, string>()
  const request = async (
    method: string,
    path: string,
    o: { headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> } = {},
  ) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const answer = await run.app.request(
      new Request(`${run.origin}${path}`, {
        method,
        headers: { origin: run.origin, ...(cookie === '' ? {} : { cookie }), ...o.headers },
        ...(o.body === undefined ? {} : { body: o.body }),
      }),
    )
    for (const line of answer.headers.getSetCookie()) {
      const [pair] = line.split(';')
      cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
    }
    return answer
  }
  return {
    async upload(bytes: Uint8Array<ArrayBuffer>, name: string, kind: string): Promise<string> {
      const answer = await request('POST', `/_t/files?name=${encodeURIComponent(name)}`, {
        headers: { 'content-type': kind, 'content-length': String(bytes.length) },
        body: bytes,
      })
      const wire = Object(await answer.json())
      assert.equal(wire.ok, true, JSON.stringify(wire))
      return String(Object(wire.value).id)
    },
    async door(path: string, accept = 'image/avif,image/webp,image/*'): Promise<{ kind: string; text: string }> {
      const answer = await request('GET', `/_t/img/${path}`, { headers: { accept } })
      return {
        kind: answer.headers.get('content-type') ?? '',
        text: Buffer.from(await answer.arrayBuffer()).toString('latin1'),
      }
    },
  }
}

/** The tiny copy that `_t_files` holds of a file, read beside the engine. */
function tinyOf(dataFolder: string, id: string): unknown {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data.prepare('SELECT tiny FROM "_t_files" WHERE id = ?').get(id)?.tiny
  } finally {
    data.close()
  }
}

test('[22-4@7a] once the resizer is there, a picture is scaled down and never up, an SVG is sent as it is, and a picture uploaded then keeps a tiny blurred copy under 1 kB', async (t) => {
  const run = await running(t, { project: 'stored', engine: { parts: { folder: partsWithResizer(t) } } })
  const guest = visitor(run)
  const large = picture(800, 600)
  const first = await guest.upload(large, 'large.png', 'image/png')
  // A picture uploaded before the resizer is there keeps no tiny copy, and the door starts the fetch of the part.
  assert.equal(tinyOf(run.dataFolder, first) ?? null, null)
  let scaled = await guest.door(`${first}?w=320`)
  for (let i = 0; i < 300 && scaled.kind !== 'image/avif'; i++) {
    await new Promise((done) => setTimeout(done, 10))
    scaled = await guest.door(`${first}?w=320`)
  }
  assert.deepEqual([scaled.kind, scaled.text], ['image/avif', 'avif 320'])
  // A picture narrower than the width is not scaled up: in its own kind it is sent as it is.
  const small = picture(100, 80)
  const narrow = await guest.upload(small, 'small.png', 'image/png')
  const asIs = await guest.door(`${narrow}?w=640`, 'image/png')
  assert.deepEqual([asIs.kind, Buffer.from(asIs.text, 'latin1').equals(Buffer.from(small))], ['image/png', true])
  // An SVG is sent as it is.
  const drawing = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>')
  const svg = await guest.upload(new Uint8Array(drawing), 'a.svg', 'image/svg+xml')
  const drawn = await guest.door(`${svg}?w=320`)
  assert.deepEqual([drawn.kind, drawn.text], ['image/svg+xml', new TextDecoder().decode(drawing)])
  // The tiny copy of a picture uploaded once the resizer is there: blurred, as a text under 1 kB.
  const tiny = String(tinyOf(run.dataFolder, narrow))
  assert.match(tiny, /^data:image\/webp;base64,/)
  assert.equal(Buffer.from(tiny.slice(tiny.indexOf(',') + 1), 'base64').toString(), 'webp 16 blurred')
  assert.ok(tiny.length < 1024)
})
